import type { Pool, PoolClient } from "pg";
import {
  buildWorkbook,
  parseOtpravkaBuffer,
  parseUlBuffer,
  type HaulzWorkbook,
  type ParsedUlFile,
} from "./index.js";

export type JobFileRow = {
  id: number;
  file_role: "otpravka" | "ul_prio1" | "ul_prio2";
  original_filename: string;
  file_data: Buffer;
};

export function serializeWorkbook(wb: HaulzWorkbook) {
  return {
    sheets: wb.sheets,
    itog_control_keys: [...wb.itogControlKeys],
  };
}

export function deserializeWorkbook(sheets: unknown, keys: unknown): HaulzWorkbook {
  return {
    sheets: Array.isArray(sheets) ? (sheets as HaulzWorkbook["sheets"]) : [],
    itogControlKeys: new Set(Array.isArray(keys) ? keys.map(String) : []),
  };
}

export async function loadJobFiles(pool: Pool | PoolClient, jobId: number): Promise<JobFileRow[]> {
  const { rows } = await pool.query<JobFileRow>(
    `select id, file_role, original_filename, file_data
     from haulz_returns_files
     where job_id = $1
     order by id asc`,
    [jobId],
  );
  return rows;
}

export function buildWorkbookFromFiles(files: JobFileRow[]): HaulzWorkbook {
  const otpravkaFile = files.find((f) => f.file_role === "otpravka");
  if (!otpravkaFile) throw new Error("Не загружен файл отправки");

  const otpravka = parseOtpravkaBuffer(
    otpravkaFile.file_data.buffer.slice(
      otpravkaFile.file_data.byteOffset,
      otpravkaFile.file_data.byteOffset + otpravkaFile.file_data.byteLength,
    ),
    otpravkaFile.original_filename,
  );

  const ulPrio1: ParsedUlFile[] = [];
  const ulPrio2: ParsedUlFile[] = [];
  for (const f of files) {
    if (f.file_role === "ul_prio1" || f.file_role === "ul_prio2") {
      const buf = f.file_data.buffer.slice(
        f.file_data.byteOffset,
        f.file_data.byteOffset + f.file_data.byteLength,
      );
      const parsed = parseUlBuffer(buf, f.original_filename);
      if (f.file_role === "ul_prio1") ulPrio1.push(parsed);
      else ulPrio2.push(parsed);
    }
  }
  if (ulPrio1.length === 0 && ulPrio2.length === 0) {
    throw new Error("Не загружен ни один упаковочный лист");
  }

  return buildWorkbook({ otpravka, ulPrio1, ulPrio2 });
}

export async function saveWorkbook(
  pool: Pool | PoolClient,
  jobId: number,
  loginKey: string,
  wb: HaulzWorkbook,
): Promise<number> {
  const payload = serializeWorkbook(wb);
  const { rows: verRows } = await pool.query<{ v: number }>(
    `select coalesce(max(version), 0) + 1 as v from haulz_returns_workbooks where job_id = $1`,
    [jobId],
  );
  const version = verRows[0]?.v ?? 1;
  await pool.query(
    `insert into haulz_returns_workbooks (job_id, version, sheets, itog_control_keys, built_by_login)
     values ($1, $2, $3::jsonb, $4::jsonb, $5)`,
    [jobId, version, JSON.stringify(payload.sheets), JSON.stringify(payload.itog_control_keys), loginKey],
  );
  return version;
}

export async function processJobWorkbook(
  pool: Pool | PoolClient,
  jobId: number,
  loginKey: string,
): Promise<{ workbook: HaulzWorkbook; version: number }> {
  const files = await loadJobFiles(pool, jobId);
  const workbook = buildWorkbookFromFiles(files);
  const version = await saveWorkbook(pool, jobId, loginKey, workbook);
  await pool.query(
    `update haulz_returns_jobs set status = 'ready', error_message = null, updated_at = now() where id = $1`,
    [jobId],
  );
  return { workbook, version };
}
