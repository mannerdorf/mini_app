import type { AuthData } from "../../types";
import type { HaulzWorkbook } from "../../../lib/haulzReturns/types";
import { normalizeWorkbookUlTdDates, workbookNeedsUlTdDateBackfill } from "../../../lib/haulzReturns/tdDocuments/parseUlTdNumber";
import { compactWorkbookForPatch } from "../../../lib/haulzReturns/workbookApi";

export type HaulzReturnsJobSummary = {
  id: string;
  title: string;
  status: string;
  otpravka_filename: string | null;
  owner_login?: string;
  created_at: string;
  updated_at: string;
  file_count: string;
  has_workbook: boolean;
};

export type HaulzReturnsFileMeta = {
  id: string;
  file_role: string;
  original_filename: string;
  file_size: string;
  ul_number: string | null;
  created_at: string;
};

function authHeaders(auth: AuthData): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
  };
}

function parseJson(res: Response, data: unknown): string {
  if (typeof (data as { error?: string })?.error === "string") return (data as { error: string }).error;
  return `HTTP ${res.status}`;
}

export async function listHaulzReturnsJobs(auth: AuthData, limit = 20): Promise<HaulzReturnsJobSummary[]> {
  const res = await fetch(`/api/haulz-returns/jobs?limit=${limit}`, { headers: authHeaders(auth) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[список сессий] ${parseJson(res, data)}`);
  return (data as { jobs?: HaulzReturnsJobSummary[] }).jobs ?? [];
}

export async function createHaulzReturnsJob(auth: AuthData, title = ""): Promise<string> {
  const res = await fetch("/api/haulz-returns/jobs", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ title }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[создание сессии] ${parseJson(res, data)}`);
  const jobId = (data as { jobId?: string }).jobId;
  if (!jobId) throw new Error("[создание сессии] Не получен jobId");
  return jobId;
}

export async function uploadHaulzReturnsFile(
  auth: AuthData,
  jobId: string,
  fileRole: "otpravka" | "ul_prio1" | "ul_prio2",
  file: File,
): Promise<void> {
  const fd = new FormData();
  fd.append("jobId", jobId);
  fd.append("fileRole", fileRole);
  fd.append("file", file);
  const res = await fetch("/api/haulz-returns/job-file", {
    method: "POST",
    headers: { "x-login": auth.login, "x-password": auth.password },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[загрузка «${file.name}»] ${parseJson(res, data)}`);
}

export type HaulzReturnsUploadItem = {
  role: "otpravka" | "ul_prio1" | "ul_prio2";
  file: File;
};

/** Строго по одному файлу: следующий запрос только после ответа сервера. */
export async function uploadHaulzReturnsFilesSequentially(
  auth: AuthData,
  jobId: string,
  items: HaulzReturnsUploadItem[],
  onProgress?: (current: number, total: number, fileName: string) => void,
  gapMs = 150,
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    onProgress?.(i + 1, items.length, item.file.name);
    await uploadHaulzReturnsFile(auth, jobId, item.role, item.file);
    if (i + 1 < items.length && gapMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, gapMs);
      });
    }
  }
}

export async function getHaulzReturnsJobSheet(
  auth: AuthData,
  jobId: string,
  sheetId: string,
): Promise<HaulzWorkbook["sheets"][number]> {
  const res = await fetch(
    `/api/haulz-returns/job-sheet?jobId=${encodeURIComponent(jobId)}&sheetId=${encodeURIComponent(sheetId)}`,
    { headers: authHeaders(auth) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[загрузка листа «${sheetId}»] ${parseJson(res, data)}`);
  const sheet = (data as { sheet?: HaulzWorkbook["sheets"][number] }).sheet;
  if (!sheet) throw new Error(`[загрузка листа «${sheetId}»] Пустой ответ`);
  return sheet;
}

export async function getHaulzReturnsJob(
  auth: AuthData,
  jobId: string,
): Promise<{
  job: { id: string; title: string; status: string; otpravka_filename: string | null; error_message: string | null };
  files: HaulzReturnsFileMeta[];
  workbook: HaulzWorkbook | null;
  needsUlTdDatePersist?: boolean;
}> {
  const res = await fetch(`/api/haulz-returns/job?jobId=${encodeURIComponent(jobId)}`, {
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[загрузка сессии] ${parseJson(res, data)}`);
  const rawWb = (data as { workbook?: HaulzWorkbook | null }).workbook;
  const needsUlTdDatePersist = rawWb ? workbookNeedsUlTdDateBackfill(rawWb) : false;
  const workbook = rawWb
    ? normalizeWorkbookUlTdDates({
        sheets: rawWb.sheets,
        itogControlKeys: new Set(
          Array.isArray(rawWb.itogControlKeys)
            ? rawWb.itogControlKeys.map(String)
            : rawWb.itogControlKeys &&
                typeof rawWb.itogControlKeys === "object" &&
                Array.isArray((rawWb.itogControlKeys as { keys?: string[] }).keys)
              ? (rawWb.itogControlKeys as { keys: string[] }).keys.map(String)
              : [],
        ),
        excludedUlNumbers: new Set(
          Array.isArray(rawWb.excludedUlNumbers)
            ? rawWb.excludedUlNumbers.map(String)
            : rawWb.itogControlKeys &&
                typeof rawWb.itogControlKeys === "object" &&
                !Array.isArray(rawWb.itogControlKeys) &&
                Array.isArray((rawWb.itogControlKeys as { excludedUl?: string[] }).excludedUl)
              ? (rawWb.itogControlKeys as { excludedUl: string[] }).excludedUl.map(String)
              : [],
        ),
        tdDraft: rawWb.tdDraft,
        tdPrepared: rawWb.tdPrepared,
      })
    : null;
  return {
    job: (data as { job: { id: string; title: string; status: string; otpravka_filename: string | null; error_message: string | null } }).job,
    files: (data as { files?: HaulzReturnsFileMeta[] }).files ?? [],
    workbook,
    needsUlTdDatePersist,
  };
}

export async function processHaulzReturnsJob(
  auth: AuthData,
  jobId: string,
): Promise<{ workbookVersion: number }> {
  const res = await fetch(`/api/haulz-returns/job-process?jobId=${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: authHeaders(auth),
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[обработка на сервере] ${parseJson(res, data)}`);
  return {
    workbookVersion: Number((data as { workbookVersion?: number }).workbookVersion) || 1,
  };
}

export async function saveHaulzReturnsWorkbook(auth: AuthData, jobId: string, workbook: HaulzWorkbook): Promise<HaulzWorkbook> {
  const patchBody = JSON.stringify({
    jobId,
    workbook: compactWorkbookForPatch(workbook),
  });
  const res = await fetch("/api/haulz-returns/job-workbook", {
    method: "PATCH",
    headers: authHeaders(auth),
    body: patchBody,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[сохранение правок] ${parseJson(res, data)}`);
  return workbook;
}

export type ItogTranslateResult = {
  rowKey: string;
  translation: string;
};

const TRANSLATE_BATCH_SIZE = 40;

export async function translateHaulzItogBatch(
  auth: AuthData,
  items: { rowKey: string; text: string }[],
): Promise<ItogTranslateResult[]> {
  const res = await fetch("/api/haulz-returns/translate-itog", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ items }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[перевод] ${parseJson(res, data)}`);
  const raw = (data as { items?: Array<{ rowKey?: string; rowId?: string; translation?: string }> }).items ?? [];
  return raw.map((row) => ({
    rowKey: String(row.rowKey ?? row.rowId ?? ""),
    translation: String(row.translation ?? ""),
  }));
}

/** Пакетный перевод ulData → translate на листе «итог» (EN→RU через OpenAI). */
export async function translateHaulzItogAll(
  auth: AuthData,
  items: { rowKey: string; text: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < items.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = items.slice(i, i + TRANSLATE_BATCH_SIZE);
    const results = await translateHaulzItogBatch(auth, batch);
    for (const row of results) {
      if (row.translation) map.set(row.rowKey, row.translation);
    }
    onProgress?.(Math.min(i + batch.length, items.length), items.length);
  }
  return map;
}

export async function deleteHaulzReturnsJob(auth: AuthData, jobId: string): Promise<void> {
  const res = await fetch(`/api/haulz-returns/job?jobId=${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    headers: {
      "x-login": auth.login,
      "x-password": auth.password,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[удаление сессии] ${parseJson(res, data)}`);
}

export async function renameHaulzReturnsJob(auth: AuthData, jobId: string, title: string): Promise<string> {
  const trimmed = title.trim();
  const res = await fetch("/api/haulz-returns/job", {
    method: "PATCH",
    headers: authHeaders(auth),
    body: JSON.stringify({ jobId, title: trimmed }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[переименование сессии] ${parseJson(res, data)}`);
  return String((data as { title?: string }).title ?? trimmed);
}
