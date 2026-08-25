import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { parseMultipart } from "../_pnl-multipart.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";
import { extractUlNumberFromFileName } from "../../lib/haulzReturns/excelUtils.js";

export const config = { api: { bodyParser: false } };

/** Лимит одного файла (на Vercel тело запроса ~4.5 МБ). */
const MAX_FILE_BYTES = 15 * 1024 * 1024;

type FileRole = "otpravka" | "ul_prio1" | "ul_prio2";

type UploadedFile = {
  jobId: number;
  fileRole: FileRole;
  originalFilename: string;
  mimetype: string;
  buffer: Buffer;
};

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) return req.body;
  if (typeof req.body === "string" && req.body.length > 0) return Buffer.from(req.body);
  const chunks: Buffer[] = [];
  for await (const chunk of req as unknown as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function asFileRole(raw: unknown): FileRole | null {
  const v = String(raw ?? "").trim();
  if (v === "otpravka" || v === "ul_prio1" || v === "ul_prio2") return v;
  return null;
}

async function parseUpload(req: VercelRequest): Promise<UploadedFile | { error: string; status: number }> {
  const ct = String(req.headers["content-type"] || "").toLowerCase();

  if (ct.includes("multipart/form-data")) {
    const { fields, files } = await parseMultipart(req);
    const jobId = Number(fields.jobId);
    const fileRole = asFileRole(fields.fileRole);
    if (!Number.isFinite(jobId) || jobId <= 0) return { error: "Укажите jobId", status: 400 };
    if (!fileRole) return { error: "fileRole: otpravka | ul_prio1 | ul_prio2", status: 400 };
    const upload = files.find((f) => f.fieldName === "file") ?? files[0];
    if (!upload?.buffer?.length) return { error: "Файл не передан", status: 400 };
    return {
      jobId,
      fileRole,
      originalFilename: upload.originalFilename,
      mimetype: upload.mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.isBuffer(upload.buffer) ? upload.buffer : Buffer.from(upload.buffer),
    };
  }

  // JSON { jobId, fileRole, fileName, mimeType?, base64 } — без formidable.
  if (ct.includes("application/json")) {
    const raw = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString("utf8") || "{}")
      : typeof req.body === "object" && req.body
        ? req.body
        : JSON.parse((await readRawBody(req)).toString("utf8") || "{}");
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const jobId = Number(body.jobId ?? req.query.jobId);
    const fileRole = asFileRole(body.fileRole ?? req.query.fileRole);
    const originalFilename = String(body.fileName ?? body.originalFilename ?? req.query.fileName ?? "upload.xlsx").trim();
    const base64 = String(body.base64 ?? body.fileBase64 ?? "").replace(/^data:[^;]+;base64,/, "").trim();
    if (!Number.isFinite(jobId) || jobId <= 0) return { error: "Укажите jobId", status: 400 };
    if (!fileRole) return { error: "fileRole: otpravka | ul_prio1 | ul_prio2", status: 400 };
    if (!base64) return { error: "Файл не передан (base64)", status: 400 };
    return {
      jobId,
      fileRole,
      originalFilename: originalFilename || "upload.xlsx",
      mimetype: String(body.mimeType ?? body.mimetype ?? "").trim()
        || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(base64, "base64"),
    };
  }

  // Сырые байты: POST ?jobId=&fileRole=&fileName=  Content-Type: application/octet-stream
  const jobId = Number(req.query.jobId);
  const fileRole = asFileRole(req.query.fileRole);
  const originalFilename = String(req.query.fileName ?? req.query.filename ?? "upload.xlsx").trim() || "upload.xlsx";
  if (!Number.isFinite(jobId) || jobId <= 0) return { error: "Укажите jobId", status: 400 };
  if (!fileRole) return { error: "fileRole: otpravka | ul_prio1 | ul_prio2", status: 400 };
  const buffer = await readRawBody(req);
  if (!buffer.length) return { error: "Файл не передан", status: 400 };
  return {
    jobId,
    fileRole,
    originalFilename,
    mimetype: ct.includes("octet-stream")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : ct.split(";")[0]?.trim() || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_job_file");
  try {
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

    const parsed = await parseUpload(req);
    if ("error" in parsed) {
      return res.status(parsed.status).json({ error: parsed.error, request_id: ctx.requestId });
    }

    const { jobId, fileRole, originalFilename, mimetype, buffer: fileData } = parsed;

    if (!(await assertJobOwner(pool, jobId, access.loginKey))) {
      return res.status(404).json({ error: "Сессия не найдена", request_id: ctx.requestId });
    }

    if (fileData.length > MAX_FILE_BYTES) {
      return res.status(413).json({
        error: `Файл «${originalFilename}» слишком большой (макс. ${MAX_FILE_BYTES / 1024 / 1024} МБ)`,
        request_id: ctx.requestId,
      });
    }

    const ulNumber = fileRole.startsWith("ul_") ? extractUlNumberFromFileName(originalFilename) : null;

    if (fileRole === "otpravka") {
      await pool.query(`delete from haulz_returns_files where job_id = $1 and file_role = 'otpravka'`, [jobId]);
    }

    const { rows } = await pool.query<{ id: string }>(
      `insert into haulz_returns_files
         (job_id, file_role, original_filename, mime_type, file_size, ul_number, file_data)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id::text`,
      [jobId, fileRole, originalFilename, mimetype, fileData.length, ulNumber, fileData],
    );

    if (fileRole === "otpravka") {
      await pool.query(
        `update haulz_returns_jobs
         set otpravka_filename = $2, status = 'uploading', updated_at = now()
         where id = $1`,
        [jobId, originalFilename],
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
      bytes: fileData.length,
      request_id: ctx.requestId,
    });
  } catch (e) {
    const msg = (e as Error)?.message || "Ошибка загрузки файла";
    logError(ctx, "haulz_returns_job_file_failed", e);
    return res.status(500).json({ error: msg, request_id: ctx.requestId });
  }
}
