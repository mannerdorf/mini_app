/**
 * Seed HAULZ calculator: tariff sets/versions, ring exits (MOXCEL), pickup xlsx.
 * Usage: npx tsx scripts/seed-haulz-calculator.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "../api/_db.js";
import { DEFAULT_CDEK_EXTRAS } from "../lib/haulzCalculator/defaultExtras.js";
import { seedKadFromDefaults, seedMkadFromRepo } from "../lib/haulzCalculator/seedRingData.js";
import { parsePickupXlsxFile } from "../lib/haulzCalculator/pickupXlsxParser.js";
import type { PickupTier } from "../lib/haulzCalculator/types.js";
import { warehouseHubRows } from "../lib/haulzCalculator/warehouses.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(__dirname, "../data/haulz-calculator-seed");

const DEFAULT_TIERS: PickupTier[] = [
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

const KGD_DEFAULT = DEFAULT_TIERS.map((t, i) => ({
  ...t,
  city_fee: [800, 1250, 1850, 2200, 2450, 3100, 3600, 4800, 6500, 7500, 12500, 23000][i] ?? t.city_fee,
  per_km: [22, 22, 22, 28, 28, 28, 33, 33, 35, 53, 53, 70][i] ?? t.per_km,
}));

function findSeedFile(names: string[]): string | null {
  if (!fs.existsSync(SEED_DIR)) return null;
  for (const name of names) {
    const p = path.join(SEED_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function upsertTariffSet(
  pool: Awaited<ReturnType<typeof getPool>>,
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

async function upsertVersion(
  pool: Awaited<ReturnType<typeof getPool>>,
  tariffSetId: number,
  effectiveFrom: string,
  payload: unknown,
) {
  await pool.query(
    `insert into haulz_calc_tariff_versions (tariff_set_id, effective_from, payload, created_by, comment)
     values ($1, $2::date, $3::jsonb, 'seed', 'initial seed')
     on conflict (tariff_set_id, effective_from) do update set payload = excluded.payload`,
    [tariffSetId, effectiveFrom, JSON.stringify(payload)],
  );
}

function buildPickupPayload(scope: "pickup" | "last_mile", moscowTiers: PickupTier[], kgdTiers: PickupTier[], note?: string) {
  return {
    scope,
    note: note || "ДО 20 КМ ОТ МКАД",
    cities: {
      moscow: { tiers: moscowTiers, ring_label: "МКАД" },
      kaliningrad: { tiers: kgdTiers, ring_label: "КАД" },
    },
  };
}

const DEFAULT_HUBS = [
  ...warehouseHubRows(),
  { code: "SVO", name: "Шереметьево", lat: 55.9726, lon: 37.4146, role: "moscow" as const },
  { code: "DME", name: "Домодедово", lat: 55.4088, lon: 37.9063, role: "moscow" as const },
  { code: "VKO", name: "Внуково", lat: 55.5965, lon: 37.2615, role: "moscow" as const },
  { code: "KGD_APT", name: "Храброво (Калининград)", lat: 54.8901, lon: 20.5926, role: "kaliningrad" as const },
];

async function main() {
  const pool = getPool();
  const effectiveFrom = "2020-01-01";

  const xlsxPath = findSeedFile(["пикап.xlsx", "pickup.xlsx"]);
  const parsedXlsx = xlsxPath ? parsePickupXlsxFile(xlsxPath) : null;
  const moscowTiers = parsedXlsx?.moscow ?? DEFAULT_TIERS;
  const kgdTiers = parsedXlsx?.kaliningrad ?? KGD_DEFAULT;
  const pickupNote = parsedXlsx?.note;

  const pickupId = await upsertTariffSet(pool, "pickup_matrix", "Заборная логистика", "pickup", null);
  const lastMileId = await upsertTariffSet(pool, "last_mile_matrix", "Последняя миля", "last_mile", null);
  const settingsId = await upsertTariffSet(pool, "calc_settings", "Настройки калькулятора", "settings", null);
  const extrasId = await upsertTariffSet(pool, "calc_extras", "Доп. услуги", "extra", null);

  await upsertVersion(pool, pickupId, effectiveFrom, buildPickupPayload("pickup", moscowTiers, kgdTiers, pickupNote));
  await upsertVersion(pool, lastMileId, effectiveFrom, buildPickupPayload("last_mile", moscowTiers, kgdTiers, pickupNote));
  await upsertVersion(pool, settingsId, effectiveFrom, { volumetric_factor_kg_m3: 200 });
  await upsertVersion(pool, extrasId, effectiveFrom, { services: DEFAULT_CDEK_EXTRAS });

  const mainlines = [
    { code: "mainline_mow_kgd_ferry", name: "Магистраль MOW→KGD паром", direction: "mow_kgd", mode: "ferry", price_per_kg: 35, delivery_days: 12 },
    { code: "mainline_mow_kgd_auto", name: "Магистраль MOW→KGD авто", direction: "mow_kgd", mode: "auto", price_per_kg: 60, delivery_days: 7 },
    { code: "mainline_kgd_mow_ferry", name: "Магистраль KGD→MOW паром", direction: "kgd_mow", mode: "ferry", price_per_kg: 100, delivery_days: 20 },
    { code: "mainline_kgd_mow_auto", name: "Магистраль KGD→MOW авто", direction: "kgd_mow", mode: "auto", price_per_kg: 60, delivery_days: 7 },
  ] as const;

  for (const m of mainlines) {
    const id = await upsertTariffSet(pool, m.code, m.name, "mainline", m.direction);
    await upsertVersion(pool, id, effectiveFrom, {
      mode: m.mode,
      price_per_kg: m.price_per_kg,
      direction: m.direction,
      delivery_days: m.delivery_days,
    });
  }

  try {
    const mkad = await seedMkadFromRepo(pool);
    console.log(`MKAD exits seeded: ${mkad}`);
  } catch (e) {
    console.warn("MKAD seed skipped:", (e as Error).message);
  }

  const kad = await seedKadFromDefaults(pool);
  console.log(`KAD exits seeded: ${kad}`);

  for (const h of DEFAULT_HUBS) {
    await pool.query(
      `insert into haulz_calc_hubs (code, name, lat, lon, role, active)
       values ($1,$2,$3,$4,$5,true)
       on conflict (code) do update set name=excluded.name, lat=excluded.lat, lon=excluded.lon, role=excluded.role`,
      [h.code, h.name, h.lat, h.lon, h.role],
    );
  }

  console.log("HAULZ calculator seed complete.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
