import type { Pool, PoolClient } from "pg";
import type { HaulzWorkbook } from "./types.js";
import {
  compactWorkbookForPatch,
  deserializeWorkbook,
  mergeWorkbookPatch,
  serializeItogControlKeysMeta,
} from "./workbookApi.js";

function isWorkbookVersionConflict(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string };
  return e.code === "23505" && String(e.constraint ?? "").includes("haulz_returns_workbooks_job_version");
}

/** INSERT новой версии workbook с повтором при гонке max(version)+1. */
export async function insertWorkbookVersion(
  pool: Pool | PoolClient,
  jobId: number,
  loginKey: string,
  wb: HaulzWorkbook,
  opts?: { stored?: HaulzWorkbook | null; maxAttempts?: number },
): Promise<number> {
  const maxAttempts = opts?.maxAttempts ?? 5;
  let stored = opts?.stored ?? null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 || !stored) {
      stored = await loadLatestWorkbook(pool, jobId);
    }
    const merged = stored ? mergeWorkbookPatch(stored, wb) : wb;
    const compact = compactWorkbookForPatch(merged);

    const { rows: verRows } = await pool.query<{ v: number }>(
      `select coalesce(max(version), 0) + 1 as v from haulz_returns_workbooks where job_id = $1`,
      [jobId],
    );
    const version = verRows[0]?.v ?? 1;

    try {
      await pool.query(
        `insert into haulz_returns_workbooks (job_id, version, sheets, itog_control_keys, built_by_login)
         values ($1, $2, $3::jsonb, $4::jsonb, $5)`,
        [
          jobId,
          version,
          JSON.stringify(compact.sheets),
          JSON.stringify(serializeItogControlKeysMeta(merged)),
          loginKey,
        ],
      );
      return version;
    } catch (error) {
      if (isWorkbookVersionConflict(error) && attempt < maxAttempts - 1) {
        stored = null;
        continue;
      }
      throw error;
    }
  }

  throw new Error("Не удалось сохранить workbook: слишком много параллельных сохранений");
}

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
  return insertWorkbookVersion(pool, jobId, loginKey, wb);
}
