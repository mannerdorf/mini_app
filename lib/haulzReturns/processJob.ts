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

/** Убирает строки УЛ из JSON-ответа API (лимит Vercel ~4.5 МБ). */
export function workbookForApi(wb: HaulzWorkbook) {
  return {
    sheets: wb.sheets.map((s) =>
      s.id.startsWith("ul-") ? { ...s, rows: [], ulDeferred: true } : s,
    ),
    itogControlKeys: [...wb.itogControlKeys],
  };
}

/** Для PATCH: клиент шлёт без строк УЛ, сервер подставляет из сохранённой версии. */
export function compactWorkbookForPatch(wb: HaulzWorkbook) {
  return {
    sheets: wb.sheets.map((s) => (s.id.startsWith("ul-") ? { ...s, rows: [] } : s)),
    itogControlKeys: [...wb.itogControlKeys],
  };
}

export function mergeWorkbookPatch(stored: HaulzWorkbook | null, incoming: HaulzWorkbook): HaulzWorkbook {
  if (!stored) return incoming;
  const storedUl = new Map(
    stored.sheets.filter((s) => s.id.startsWith("ul-")).map((s) => [s.id, s]),
  );
  const mergedSheets = incoming.sheets.map((s) => {
    if (s.id.startsWith("ul-") && s.rows.length === 0) {
      const prev = storedUl.get(s.id);
      if (prev) return prev;
    }
    return s;
  });
  for (const [id, sheet] of storedUl) {
    if (!mergedSheets.some((s) => s.id === id)) mergedSheets.push(sheet);
  }
  return {
    sheets: mergedSheets,
    itogControlKeys: incoming.itogControlKeys.size > 0 ? incoming.itogControlKeys : stored.itogControlKeys,
  };
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
