import type { Pool } from "pg";
import type {
  ExtrasBlockPayload,
  MainlinePayload,
  PickupMatrixPayload,
  SettingsPayload,
  TariffSetRow,
  TariffVersionRow,
} from "./types.js";

export function todayDateMoscow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function listTariffSets(pool: Pool): Promise<TariffSetRow[]> {
  const { rows } = await pool.query<TariffSetRow>(
    `select id, code, name, block, direction from haulz_calc_tariff_sets order by block, code`,
  );
  return rows;
}

export async function getActiveVersion(
  pool: Pool,
  tariffSetId: number,
  asOfDate?: string,
): Promise<TariffVersionRow | null> {
  const day = asOfDate || todayDateMoscow();
  const { rows } = await pool.query<TariffVersionRow>(
    `select id, tariff_set_id, effective_from::text, payload, comment, created_by, created_at::text
     from haulz_calc_tariff_versions
     where tariff_set_id = $1 and effective_from <= $2::date
     order by effective_from desc
     limit 1`,
    [tariffSetId, day],
  );
  return rows[0] ?? null;
}

export async function getActiveVersionByCode(
  pool: Pool,
  code: string,
  asOfDate?: string,
): Promise<{ set: TariffSetRow; version: TariffVersionRow } | null> {
  const { rows: sets } = await pool.query<TariffSetRow>(
    `select id, code, name, block, direction from haulz_calc_tariff_sets where code = $1`,
    [code],
  );
  const set = sets[0];
  if (!set) return null;
  const version = await getActiveVersion(pool, set.id, asOfDate);
  if (!version) return null;
  return { set, version };
}

export async function loadCalculatorTariffs(pool: Pool, asOfDate?: string) {
  const day = asOfDate || todayDateMoscow();
  const sets = await listTariffSets(pool);
  const byCode: Record<string, { set: TariffSetRow; version: TariffVersionRow | null }> = {};
  for (const set of sets) {
    byCode[set.code] = { set, version: await getActiveVersion(pool, set.id, day) };
  }

  const pickup = byCode.pickup_matrix?.version?.payload as PickupMatrixPayload | undefined;
  const lastMile = byCode.last_mile_matrix?.version?.payload as PickupMatrixPayload | undefined;
  const settings = byCode.calc_settings?.version?.payload as SettingsPayload | undefined;
  const extras = byCode.calc_extras?.version?.payload as ExtrasBlockPayload | undefined;

  const mainline: MainlinePayload[] = [];
  for (const [code, entry] of Object.entries(byCode)) {
    if (entry.set.block !== "mainline" || !entry.version) continue;
    const p = entry.version.payload as MainlinePayload;
    if (p && typeof p === "object" && p.mode && p.direction) {
      mainline.push(p);
    }
  }

  return {
    asOfDate: day,
    pickup: pickup ?? null,
    lastMile: lastMile ?? pickup ?? null,
    settings,
    extras,
    mainline,
    sets,
    byCode,
  };
}

export async function listVersionHistory(pool: Pool, tariffSetId: number, limit = 50): Promise<TariffVersionRow[]> {
  const { rows } = await pool.query<TariffVersionRow>(
    `select id, tariff_set_id, effective_from::text, payload, comment, created_by, created_at::text
     from haulz_calc_tariff_versions
     where tariff_set_id = $1
     order by effective_from desc, id desc
     limit $2`,
    [tariffSetId, limit],
  );
  return rows;
}
