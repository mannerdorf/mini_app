import type { AuthData } from "../../types";
import type { TdDocType, TdDraft } from "../../../lib/haulzReturns/tdDocuments/index";

function authHeaders(auth: AuthData): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
  };
}

export async function exportTdDocument(
  auth: AuthData,
  jobId: string,
  docType: TdDocType,
  draft?: TdDraft,
): Promise<{ blob: Blob; fileName: string }> {
  const res = await fetch("/api/haulz-returns/td-export", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ jobId, docType, draft }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(cd);
  const fileName = match?.[1] ? decodeURIComponent(match[1]) : docType === "all" ? "ТД-документы.zip" : `${docType}.xlsx`;
  return { blob, fileName };
}

export function downloadTdBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
