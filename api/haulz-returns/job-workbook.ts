import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";
import type { HaulzWorkbook } from "../../lib/haulzReturns/types.js";
import { deserializeWorkbook, mergeWorkbookPatch, workbookForApi } from "../../lib/haulzReturns/workbookApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_job_workbook");
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzReturnsAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const jobId = Number(req.body?.jobId);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return res.status(400).json({ error: "Укажите jobId", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_returns_workbooks"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/080_haulz_returns.sql",
      request_id: ctx.requestId,
    });
  }
  if (!(await assertJobOwner(pool, jobId, access.loginKey))) {
    return res.status(404).json({ error: "Сессия не найдена", request_id: ctx.requestId });
  }

  try {
    const raw = req.body?.workbook as HaulzWorkbook | undefined;
    if (!raw?.sheets || !Array.isArray(raw.sheets)) {
      return res.status(400).json({ error: "Передайте workbook.sheets", request_id: ctx.requestId });
    }
    const wb: HaulzWorkbook = {
      sheets: raw.sheets,
      itogControlKeys: new Set(
        Array.isArray(raw.itogControlKeys)
          ? raw.itogControlKeys.map(String)
          : raw.itogControlKeys && typeof raw.itogControlKeys === "object"
            ? Object.values(raw.itogControlKeys as Record<string, string>).map(String)
            : [],
      ),
    };

    const { rows: storedRows } = await pool.query<{ sheets: unknown; itog_control_keys: unknown }>(
      `select sheets, itog_control_keys
       from haulz_returns_workbooks
       where job_id = $1
       order by version desc
       limit 1`,
      [jobId],
    );
    const stored = storedRows[0]
      ? deserializeWorkbook(storedRows[0].sheets, storedRows[0].itog_control_keys)
      : null;
    const merged = mergeWorkbookPatch(stored, wb);

    const { rows: verRows } = await pool.query<{ v: number }>(
      `select coalesce(max(version), 0) + 1 as v from haulz_returns_workbooks where job_id = $1`,
      [jobId],
    );
    const version = verRows[0]?.v ?? 1;
    await pool.query(
      `insert into haulz_returns_workbooks (job_id, version, sheets, itog_control_keys, built_by_login)
       values ($1, $2, $3::jsonb, $4::jsonb, $5)`,
      [jobId, version, JSON.stringify(merged.sheets), JSON.stringify([...merged.itogControlKeys]), access.loginKey],
    );
    await pool.query(
      `update haulz_returns_jobs set status = 'ready', updated_at = now() where id = $1`,
      [jobId],
    );

    return res.status(200).json({
      ok: true,
      workbookVersion: version,
      workbook: workbookForApi(merged),
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "haulz_returns_job_workbook_failed", e);
    const msg = (e as Error)?.message || "Ошибка сохранения";
    return res.status(500).json({ error: msg, request_id: ctx.requestId });
  }
}
