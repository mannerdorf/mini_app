import type { AuthData } from "../../types";
import { downloadBlob } from "../../lib/haulzReturns";

export type UploadProgress = {
  current: number;
  total: number;
  fileName: string;
};

export type FileSlot = {
  id: string;
  file: File;
};

export const YELLOW_BADGE_TAB_IDS = new Set(["kgd", "plomby", "stop"]);
export const RED_BADGE_TAB_IDS = new Set(["itog"]);

export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatJobDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function haulzJobDisplayTitle(job: { id: string; title: string; otpravka_filename: string | null }): string {
  return job.title.trim() || job.otpravka_filename || `Сессия ${job.id}`;
}

export async function downloadStoredFile(auth: AuthData, jobId: string, fileId: string, fileName: string) {
  const res = await fetch(
    `/api/haulz-returns/job-file-download?jobId=${encodeURIComponent(jobId)}&fileId=${encodeURIComponent(fileId)}`,
    { headers: { "x-login": auth.login, "x-password": auth.password } },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  downloadBlob(blob, fileName);
}
