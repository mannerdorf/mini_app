import type { Pool } from "pg";
import { DEFAULT_CDEK_EXTRAS } from "./defaultExtras.js";
import type { PickupTier } from "./types.js";

export const DEFAULT_PICKUP_TIERS: PickupTier[] = [
  { weight_max_kg: 100, volume_max_m3: 0.5, city_fee: 1350, per_km: 23, load_minutes: 30, overtime_rub_per_hour: 700 },
  { weight_max_kg: 500, volume_max_m3: 2, city_fee: 2300, per_km: 24, load_minutes: 30, overtime_rub_per_hour: 700 },
  { weight_max_kg: 1000, volume_max_m3: 4, city_fee: 3200, per_km: 25, load_minutes: 45, overtime_rub_per_hour: 700 },
  { weight_max_kg: 1250, volume_max_m3: 6, city_fee: 3800, per_km: 27, load_minutes: 45, overtime_rub_per_hour: 700 },
  { weight_max_kg: 1500, volume_max_m3: 8, city_fee: 3900, per_km: 27, load_minutes: 45, overtime_rub_per_hour: 700 },
  { weight_max_kg: 2000, volume_max_m3: 12, city_fee: 5600, per_km: 27, load_minutes: 60, overtime_rub_per_hour: 1000 },
  { weight_max_kg: 2500, volume_max_m3: 14, city_fee: 7000, per_km: 33, load_minutes: 60, overtime_rub_per_hour: 1000 },
  { weight_max_kg: 3000, volume_max_m3: 16, city_fee: 7500, per_km: 33, load_minutes: 60, overtime_rub_per_hour: 1000 },
  { weight_max_kg: 5000, volume_max_m3: 30, city_fee: 8900, per_km: 44, load_minutes: 90, overtime_rub_per_hour: 1500 },
  { weight_max_kg: 7000, volume_max_m3: 35, city_fee: 15000, per_km: 53, load_minutes: 120, overtime_rub_per_hour: 1800 },
  { weight_max_kg: 10000, volume_max_m3: 40, city_fee: 15500, per_km: 53, load_minutes: 120, overtime_rub_per_hour: 2000 },
  { weight_max_kg: 20000, volume_max_m3: 86, city_fee: 23000, per_km: 70, load_minutes: 120, overtime_rub_per_hour: 2200 },
];

const KGD_DEFAULT = DEFAULT_PICKUP_TIERS.map((t, i) => ({
  ...t,
  city_fee: [800, 1250, 1850, 2200, 2450, 3100, 3600, 4800, 6500, 7500, 12500, 23000][i] ?? t.city_fee,
  per_km: [22, 22, 22, 28, 28, 28, 33, 33, 35, 53, 53, 70][i] ?? t.per_km,
}));

async function upsertTariffSet(
  pool: Pool,
  code: string,
  name: string,
  block: string,
  direction: string | null,
): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into haulz_calc_tariff_sets (code, name, block, direction)
     values ($1, $2, $3, $4)
     on conflict (code) do update set name = excluded.name, block = excluded.block, direction = excluded.direction
     returning id::text`,
    [code, name, block, direction],
  );
  return Number(rows[0].id);
}

/** Добавляет стартовую версию только если у набора ещё нет ни одной версии. */
async function ensureInitialVersion(pool: Pool, tariffSetId: number, effectiveFrom: string, payload: unknown) {
  const { rows } = await pool.query(`select 1 from haulz_calc_tariff_versions where tariff_set_id = $1 limit 1`, [
    tariffSetId,
  ]);
  if (rows.length > 0) return;
  await pool.query(
    `insert into haulz_calc_tariff_versions (tariff_set_id, effective_from, payload, created_by, comment)
     values ($1, $2::date, $3::jsonb, 'bootstrap', 'bootstrap defaults')`,
    [tariffSetId, effectiveFrom, JSON.stringify(payload)],
  );
}

function buildPickupPayload(
  scope: "pickup" | "last_mile",
  moscowTiers: PickupTier[],
  kgdTiers: PickupTier[],
  note?: string,
) {
  return {
    scope,
    note: note || "ДО 20 КМ ОТ МКАД",
    cities: {
      moscow: { tiers: moscowTiers, ring_label: "МКАД" },
      kaliningrad: { tiers: kgdTiers, ring_label: "КАД" },
    },
  };
}

/** Создаёт наборы тарифов и стартовые версии, если их ещё нет в БД. */
export async function bootstrapHaulzCalculatorTariffs(
  pool: Pool,
  opts?: { effectiveFrom?: string },
): Promise<{ sets: number; versionsWritten: number; wasEmpty: boolean }> {
  const effectiveFrom = opts?.effectiveFrom || "2020-01-01";
  const before = await pool.query<{ n: string }>(`select count(*)::text as n from haulz_calc_tariff_sets`);
  const setsBefore = Number(before.rows[0]?.n) || 0;

  const pickupId = await upsertTariffSet(pool, "pickup_matrix", "Заборная логистика", "pickup", null);
  const lastMileId = await upsertTariffSet(pool, "last_mile_matrix", "Последняя миля", "last_mile", null);
  const settingsId = await upsertTariffSet(pool, "calc_settings", "Настройки калькулятора", "settings", null);
  const extrasId = await upsertTariffSet(pool, "calc_extras", "Доп. услуги", "extra", null);

  await ensureInitialVersion(
    pool,
    pickupId,
    effectiveFrom,
    buildPickupPayload("pickup", DEFAULT_PICKUP_TIERS, KGD_DEFAULT),
  );
  await ensureInitialVersion(
    pool,
    lastMileId,
    effectiveFrom,
    buildPickupPayload("last_mile", DEFAULT_PICKUP_TIERS, KGD_DEFAULT),
  );
  await ensureInitialVersion(pool, settingsId, effectiveFrom, {
    volumetric_factor_kg_m3: 200,
    mainline_min_chargeable_weight_kg: 20,
  });
  await ensureInitialVersion(pool, extrasId, effectiveFrom, { services: DEFAULT_CDEK_EXTRAS });

  const mainlines = [
    { code: "mainline_mow_kgd_ferry", name: "Магистраль MOW→KGD паром", direction: "mow_kgd", mode: "ferry", price_per_kg: 35, delivery_days: 12 },
    { code: "mainline_mow_kgd_auto", name: "Магистраль MOW→KGD авто", direction: "mow_kgd", mode: "auto", price_per_kg: 60, delivery_days: 7 },
    { code: "mainline_mow_kgd_air", name: "Магистраль MOW→KGD авиа", direction: "mow_kgd", mode: "air", price_per_kg: 120, delivery_days: 3 },
    { code: "mainline_kgd_mow_ferry", name: "Магистраль KGD→MOW паром", direction: "kgd_mow", mode: "ferry", price_per_kg: 100, delivery_days: 20 },
    { code: "mainline_kgd_mow_auto", name: "Магистраль KGD→MOW авто", direction: "kgd_mow", mode: "auto", price_per_kg: 60, delivery_days: 7 },
    { code: "mainline_kgd_mow_air", name: "Магистраль KGD→MOW авиа", direction: "kgd_mow", mode: "air", price_per_kg: 250, delivery_days: 4 },
  ] as const;

  for (const m of mainlines) {
    const id = await upsertTariffSet(pool, m.code, m.name, "mainline", m.direction);
    await ensureInitialVersion(pool, id, effectiveFrom, {
      mode: m.mode,
      price_per_kg: m.price_per_kg,
      direction: m.direction,
      delivery_days: m.delivery_days,
    });
  }

  const after = await pool.query<{ n: string }>(`select count(*)::text as n from haulz_calc_tariff_sets`);
  const setsAfter = Number(after.rows[0]?.n) || 0;

  const { rows: verRows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from haulz_calc_tariff_versions where created_by = 'bootstrap'`,
  );

  return {
    sets: setsAfter,
    versionsWritten: Number(verRows[0]?.n) || 0,
    wasEmpty: setsBefore === 0,
  };
}

const AIR_MAINLINES = [
  { code: "mainline_mow_kgd_air", name: "Магистраль MOW→KGD авиа", direction: "mow_kgd", mode: "air", price_per_kg: 120, delivery_days: 3 },
  { code: "mainline_kgd_mow_air", name: "Магистраль KGD→MOW авиа", direction: "kgd_mow", mode: "air", price_per_kg: 250, delivery_days: 4 },
] as const;

/** Добавляет наборы авиа, если их ещё нет (идемпотентно). */
export async function ensureAirMainlineTariffSets(
  pool: Pool,
  opts?: { effectiveFrom?: string },
): Promise<void> {
  const effectiveFrom = opts?.effectiveFrom || "2020-01-01";
  for (const m of AIR_MAINLINES) {
    const id = await upsertTariffSet(pool, m.code, m.name, "mainline", m.direction);
    await ensureInitialVersion(pool, id, effectiveFrom, {
      mode: m.mode,
      price_per_kg: m.price_per_kg,
      direction: m.direction,
      delivery_days: m.delivery_days,
    });
  }
}

export async function ensureTariffSetExists(pool: Pool, code: string): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(`select id::text from haulz_calc_tariff_sets where code = $1`, [code]);
  if (rows[0]?.id) return Number(rows[0].id);
  await bootstrapHaulzCalculatorTariffs(pool);
  const { rows: again } = await pool.query<{ id: string }>(`select id::text from haulz_calc_tariff_sets where code = $1`, [code]);
  const id = Number(again[0]?.id);
  if (!id) throw new Error(`Набор тарифов ${code} не найден после инициализации`);
  return id;
}
