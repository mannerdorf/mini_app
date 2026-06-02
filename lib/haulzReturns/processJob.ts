import type { Pool, PoolClient } from "pg";
import { buildWorkbook } from "./buildWorkbook.js";
import { parseOtpravkaBuffer } from "./parseOtpravka.js";
import { parseUlBuffer } from "./parseUl.js";
import type { HaulzWorkbook, ParsedUlFile } from "./types.js";

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

export {
  compactWorkbookForPatch,
  deserializeWorkbook,
  mergeWorkbookPatch,
  workbookForApi,
} from "./workbookApi.js";

export { loadLatestWorkbook, saveWorkbook } from "./workbookStorage.js";

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

function fileDataToArrayBuffer(data: Buffer): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function buildWorkbookFromFiles(files: JobFileRow[]): HaulzWorkbook {
  const otpravkaFile = files.find((f) => f.file_role === "otpravka");
  if (!otpravkaFile) throw new Error("Не загружен файл отправки");

  const otpravka = parseOtpravkaBuffer(
    fileDataToArrayBuffer(otpravkaFile.file_data),
    otpravkaFile.original_filename,
  );

  const ulPrio1: ParsedUlFile[] = [];
  const ulPrio2: ParsedUlFile[] = [];
  for (const f of files) {
    if (f.file_role === "ul_prio1" || f.file_role === "ul_prio2") {
      const parsed = parseUlBuffer(fileDataToArrayBuffer(f.file_data), f.original_filename);
      if (f.file_role === "ul_prio1") ulPrio1.push(parsed);
      else ulPrio2.push(parsed);
    }
  }
  if (ulPrio1.length === 0 && ulPrio2.length === 0) {
    throw new Error("Не загружен ни один упаковочный лист");
  }

  return buildWorkbook({ otpravka, ulPrio1, ulPrio2 });
}

export async function processJobWorkbook(
  pool: Pool | PoolClient,
  jobId: number,
  loginKey: string,
): Promise<{ workbook: HaulzWorkbook; version: number }> {
  const { saveWorkbook: save } = await import("./workbookStorage.js");
  const files = await loadJobFiles(pool, jobId);
  let workbook = buildWorkbookFromFiles(files);
  const { translateItogWorkbook } = await import("./translateOperations.js");
  try {
    workbook = await translateItogWorkbook(workbook);
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "haulz_translate_itog_skipped",
        jobId,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
  const version = await save(pool, jobId, loginKey, workbook);
  await pool.query(
    `update haulz_returns_jobs set status = 'ready', error_message = null, updated_at = now() where id = $1`,
    [jobId],
  );
  return { workbook, version };
}
