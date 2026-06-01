import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_job_file_download");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzReturnsAccess(req);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const jobId = Number(req.query.jobId);
  const fileId = Number(req.query.fileId);
  if (!Number.isFinite(jobId) || !Number.isFinite(fileId)) {
    return res.status(400).json({ error: "Укажите jobId и fileId", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_returns_files"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/080_haulz_returns.sql",
      request_id: ctx.requestId,
    });
  }
  if (!(await assertJobOwner(pool, jobId, access.loginKey))) {
    return res.status(404).json({ error: "Сессия не найдена", request_id: ctx.requestId });
  }

  try {
    const { rows } = await pool.query<{
      file_data: Buffer;
      original_filename: string;
      mime_type: string | null;
    }>(
      `select file_data, original_filename, mime_type
       from haulz_returns_files
       where id = $1 and job_id = $2`,
      [fileId, jobId],
    );
    const row = rows[0];
    if (!row?.file_data) {
      return res.status(404).json({ error: "Файл не найден", request_id: ctx.requestId });
    }
    const mime = row.mime_type?.trim() || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const name = row.original_filename?.trim() || "file.xlsx";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
    return res.send(row.file_data);
  } catch (e) {
    logError(ctx, "haulz_returns_file_download_failed", e);
    return res.status(500).json({ error: "Ошибка скачивания", request_id: ctx.requestId });
  }
}
