import type { AuthData } from "../../types";
import type { HaulzWorkbook } from "../../../lib/haulzReturns/types";
import { compactWorkbookForPatch } from "../../../lib/haulzReturns/processJob";

export type HaulzReturnsJobSummary = {
  id: string;
  title: string;
  status: string;
  otpravka_filename: string | null;
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
  if (!res.ok) throw new Error(parseJson(res, data));
  return (data as { jobs?: HaulzReturnsJobSummary[] }).jobs ?? [];
}

export async function createHaulzReturnsJob(auth: AuthData, title = ""): Promise<string> {
  const res = await fetch("/api/haulz-returns/jobs", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ title }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseJson(res, data));
  const jobId = (data as { jobId?: string }).jobId;
  if (!jobId) throw new Error("Не получен jobId");
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
  if (!res.ok) throw new Error(parseJson(res, data));
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
  if (!res.ok) throw new Error(parseJson(res, data));
  return {
    workbookVersion: Number((data as { workbookVersion?: number }).workbookVersion) || 1,
  };
}

export async function getHaulzReturnsJob(
  auth: AuthData,
  jobId: string,
): Promise<{
  job: { id: string; title: string; status: string; otpravka_filename: string | null; error_message: string | null };
  files: HaulzReturnsFileMeta[];
  workbook: HaulzWorkbook | null;
}> {
  const res = await fetch(`/api/haulz-returns/job?jobId=${encodeURIComponent(jobId)}`, {
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseJson(res, data));
  const rawWb = (data as { workbook?: HaulzWorkbook | null }).workbook;
  const workbook = rawWb
    ? {
        sheets: rawWb.sheets,
        itogControlKeys: new Set(
          Array.isArray(rawWb.itogControlKeys) ? rawWb.itogControlKeys.map(String) : [],
        ),
      }
    : null;
  return {
    job: (data as { job: { id: string; title: string; status: string; otpravka_filename: string | null; error_message: string | null } }).job,
    files: (data as { files?: HaulzReturnsFileMeta[] }).files ?? [],
    workbook,
  };
}

export async function saveHaulzReturnsWorkbook(auth: AuthData, jobId: string, workbook: HaulzWorkbook): Promise<HaulzWorkbook> {
  const res = await fetch("/api/haulz-returns/job-workbook", {
    method: "PATCH",
    headers: authHeaders(auth),
    body: JSON.stringify({
      jobId,
      workbook: compactWorkbookForPatch(workbook),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseJson(res, data));
  const wb = (data as { workbook?: HaulzWorkbook & { itogControlKeys?: string[] } }).workbook;
  const mergedSheets = wb?.sheets ?? workbook.sheets;
  const mergedKeys = Array.isArray(wb?.itogControlKeys) ? wb.itogControlKeys.map(String) : [...workbook.itogControlKeys];
  return {
    sheets: mergedSheets.map((s) => {
      const local = workbook.sheets.find((ls) => ls.id === s.id);
      if (s.id.startsWith("ul-") && s.ulDeferred && local && local.rows.length > 0) return local;
      return s;
    }),
    itogControlKeys: new Set(mergedKeys),
  };
}

export async function deleteHaulzReturnsJob(auth: AuthData, jobId: string): Promise<void> {
  const res = await fetch(`/api/haulz-returns/job?jobId=${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    headers: authHeaders(auth),
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseJson(res, data));
}
