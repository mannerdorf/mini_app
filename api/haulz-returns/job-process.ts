import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_job_process");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzReturnsAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const jobId = Number(req.query.jobId ?? req.body?.jobId);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return res.status(400).json({ error: "Укажите jobId", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_returns_jobs"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/080_haulz_returns.sql",
      request_id: ctx.requestId,
    });
  }
  if (!(await assertJobOwner(pool, jobId, access.loginKey))) {
    return res.status(404).json({ error: "Сессия не найдена", request_id: ctx.requestId });
  }

  try {
    await pool.query(
      `update haulz_returns_jobs set status = 'uploading', error_message = null, updated_at = now() where id = $1`,
      [jobId],
    );
    const { rows: fileCountRows } = await pool.query<{ c: string }>(
      `select count(*)::text as c from haulz_returns_files where job_id = $1`,
      [jobId],
    );
    // #region agent log
    console.log(
      JSON.stringify({
        sessionId: "e39252",
        location: "job-process.ts:handler",
        message: "process_start",
        hypothesisId: "G",
        data: { jobId, fileCount: fileCountRows[0]?.c ?? "0" },
        timestamp: Date.now(),
      }),
    );
    // #endregion
    const { processJobWorkbook } = await import("../../lib/haulzReturns/processJob.js");
    const { version } = await processJobWorkbook(pool, jobId, access.loginKey);
    return res.status(200).json({
      ok: true,
      jobId: String(jobId),
      workbookVersion: version,
      request_id: ctx.requestId,
    });
  } catch (e) {
    const msg = (e as Error)?.message || "Ошибка обработки";
    await pool.query(
      `update haulz_returns_jobs set status = 'failed', error_message = $2, updated_at = now() where id = $1`,
      [jobId, msg.slice(0, 2000)],
    );
    logError(ctx, "haulz_returns_job_process_failed", e);
    return res.status(400).json({ error: msg, request_id: ctx.requestId });
  }
}
