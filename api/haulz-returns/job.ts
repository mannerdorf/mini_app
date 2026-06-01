import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";
import { deserializeWorkbook } from "../../lib/haulzReturns/processJob.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_job");
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
    if (req.method === "GET") {
      const { rows: jobRows } = await pool.query<{
        id: string;
        title: string;
        status: string;
        otpravka_filename: string | null;
        error_message: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `select id::text, title, status, otpravka_filename, error_message, created_at, updated_at
         from haulz_returns_jobs where id = $1`,
        [jobId],
      );
      const job = jobRows[0];
      if (!job) return res.status(404).json({ error: "Сессия не найдена", request_id: ctx.requestId });

      const { rows: files } = await pool.query<{
        id: string;
        file_role: string;
        original_filename: string;
        file_size: string;
        ul_number: string | null;
        created_at: string;
      }>(
        `select id::text, file_role, original_filename, file_size::text, ul_number, created_at
         from haulz_returns_files where job_id = $1 order by id asc`,
        [jobId],
      );

      const { rows: wbRows } = await pool.query<{
        version: number;
        sheets: unknown;
        itog_control_keys: unknown;
        built_at: string;
      }>(
        `select version, sheets, itog_control_keys, built_at
         from haulz_returns_workbooks
         where job_id = $1
         order by version desc
         limit 1`,
        [jobId],
      );
      const wbRow = wbRows[0];
      const workbook = wbRow
        ? deserializeWorkbook(wbRow.sheets, wbRow.itog_control_keys)
        : null;

      return res.status(200).json({
        job,
        files,
        workbook,
        workbookVersion: wbRow?.version ?? null,
        request_id: ctx.requestId,
      });
    }

    if (req.method === "DELETE") {
      await pool.query(`delete from haulz_returns_jobs where id = $1`, [jobId]);
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_returns_job_failed", e);
    return res.status(500).json({ error: "Ошибка сервера", request_id: ctx.requestId });
  }
}
