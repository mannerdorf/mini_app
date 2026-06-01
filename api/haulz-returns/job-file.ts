import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { parseMultipart } from "../_pnl-multipart.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";
import { parseUlBuffer } from "../../lib/haulzReturns/parseUl.js";

export const config = { api: { bodyParser: false } };

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_job_file");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const pool = getPool();
  const access = await resolveHaulzReturnsAccess(req);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  if (!(await pgTableExists(pool, "haulz_returns_files"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/080_haulz_returns.sql",
      request_id: ctx.requestId,
    });
  }

  try {
    const { fields, files } = await parseMultipart(req);
    const jobId = Number(fields.jobId);
    const fileRole = String(fields.fileRole ?? "").trim() as "otpravka" | "ul_prio1" | "ul_prio2";
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return res.status(400).json({ error: "Укажите jobId", request_id: ctx.requestId });
    }
    if (!["otpravka", "ul_prio1", "ul_prio2"].includes(fileRole)) {
      return res.status(400).json({ error: "fileRole: otpravka | ul_prio1 | ul_prio2", request_id: ctx.requestId });
    }
    if (!(await assertJobOwner(pool, jobId, access.loginKey))) {
      return res.status(404).json({ error: "Сессия не найдена", request_id: ctx.requestId });
    }

    const upload = files.find((f) => f.fieldName === "file") ?? files[0];
    if (!upload?.buffer?.length) {
      return res.status(400).json({ error: "Файл не передан", request_id: ctx.requestId });
    }
    if (upload.buffer.length > MAX_FILE_BYTES) {
      return res.status(413).json({
        error: `Файл слишком большой (макс. ${MAX_FILE_BYTES / 1024 / 1024} МБ)`,
        request_id: ctx.requestId,
      });
    }

    let ulNumber: string | null = null;
    if (fileRole.startsWith("ul_")) {
      try {
        const parsed = parseUlBuffer(
          upload.buffer.buffer.slice(
            upload.buffer.byteOffset,
            upload.buffer.byteOffset + upload.buffer.byteLength,
          ),
          upload.originalFilename,
        );
        ulNumber = parsed.ulNumber;
      } catch {
        /* сохраним файл даже если парсинг не удался — ошибка на process */
      }
    }

    if (fileRole === "otpravka") {
      await pool.query(`delete from haulz_returns_files where job_id = $1 and file_role = 'otpravka'`, [jobId]);
    }

    const { rows } = await pool.query<{ id: string }>(
      `insert into haulz_returns_files
         (job_id, file_role, original_filename, mime_type, file_size, ul_number, file_data)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id::text`,
      [
        jobId,
        fileRole,
        upload.originalFilename,
        upload.mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upload.buffer.length,
        ulNumber,
        upload.buffer,
      ],
    );

    if (fileRole === "otpravka") {
      await pool.query(
        `update haulz_returns_jobs
         set otpravka_filename = $2, status = 'uploading', updated_at = now()
         where id = $1`,
        [jobId, upload.originalFilename],
      );
    } else {
      await pool.query(
        `update haulz_returns_jobs set status = 'uploading', updated_at = now() where id = $1`,
        [jobId],
      );
    }

    return res.status(201).json({
      fileId: rows[0]?.id,
      ulNumber,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "haulz_returns_job_file_failed", e);
    return res.status(500).json({ error: "Ошибка загрузки файла", request_id: ctx.requestId });
  }
}
