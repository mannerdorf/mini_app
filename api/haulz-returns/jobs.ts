import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists, resolveHaulzReturnsAccess } from "../_haulzReturns.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_jobs");
  const pool = getPool();
  const access = await resolveHaulzReturnsAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  if (!(await pgTableExists(pool, "haulz_returns_jobs"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/080_haulz_returns.sql",
      request_id: ctx.requestId,
    });
  }

  try {
    if (req.method === "GET") {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const { rows } = await pool.query<{
        id: string;
        title: string;
        status: string;
        otpravka_filename: string | null;
        created_at: string;
        updated_at: string;
        file_count: string;
        has_workbook: boolean;
      }>(
        `select
           j.id::text,
           j.title,
           j.status,
           j.otpravka_filename,
           j.created_at,
           j.updated_at,
           (select count(*)::text from haulz_returns_files f where f.job_id = j.id) as file_count,
           exists(select 1 from haulz_returns_workbooks w where w.job_id = j.id) as has_workbook
         from haulz_returns_jobs j
         where j.owner_login = $1
         order by j.created_at desc
         limit $2`,
        [access.loginKey, limit],
      );
      return res.status(200).json({ jobs: rows, request_id: ctx.requestId });
    }

    if (req.method === "POST") {
      const title = String(req.body?.title ?? "").trim();
      const { rows } = await pool.query<{ id: string }>(
        `insert into haulz_returns_jobs (owner_login, title, status)
         values ($1, $2, 'draft')
         returning id::text`,
        [access.loginKey, title],
      );
      return res.status(201).json({ jobId: rows[0]?.id, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_returns_jobs_failed", e);
    return res.status(500).json({ error: "Ошибка сервера", request_id: ctx.requestId });
  }
}
