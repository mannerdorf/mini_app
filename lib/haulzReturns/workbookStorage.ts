import type { Pool, PoolClient } from "pg";
import type { HaulzWorkbook } from "./types.js";
import { compactWorkbookForPatch, deserializeWorkbook, serializeItogControlKeysMeta } from "./workbookApi.js";

export async function loadLatestWorkbook(
  pool: Pool | PoolClient,
  jobId: number,
): Promise<HaulzWorkbook | null> {
  const { rows } = await pool.query<{ sheets: unknown; itog_control_keys: unknown }>(
    `select sheets, itog_control_keys
     from haulz_returns_workbooks
     where job_id = $1
     order by version desc
     limit 1`,
    [jobId],
  );
  const row = rows[0];
  if (!row) return null;
  return deserializeWorkbook(row.sheets, row.itog_control_keys);
}

export async function saveWorkbook(
  pool: Pool | PoolClient,
  jobId: number,
  loginKey: string,
  wb: HaulzWorkbook,
): Promise<number> {
  const { rows: verRows } = await pool.query<{ v: number }>(
    `select coalesce(max(version), 0) + 1 as v from haulz_returns_workbooks where job_id = $1`,
    [jobId],
  );
  const version = verRows[0]?.v ?? 1;
  const compact = compactWorkbookForPatch(wb);
  await pool.query(
    `insert into haulz_returns_workbooks (job_id, version, sheets, itog_control_keys, built_by_login)
     values ($1, $2, $3::jsonb, $4::jsonb, $5)`,
    [jobId, version, JSON.stringify(compact.sheets), JSON.stringify(serializeItogControlKeysMeta(wb)), loginKey],
  );
  return version;
}
