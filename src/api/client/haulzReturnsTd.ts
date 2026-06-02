import type { AuthData } from "../../types";
import type { TdDocType, TdDraft } from "../../../lib/haulzReturns/tdDocuments/index";

function authHeaders(auth: AuthData): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
  };
}

function defaultFileName(docType: TdDocType): string {
  if (docType === "all") return "ТД-документы.zip";
  if (docType === "proforma") return "Проформа.xlsx";
  if (docType === "specification") return "Спецификация.xlsx";
  if (docType === "poruchenie") return "Поручение.docx";
  if (docType === "writeoff") return "Листы списания.xlsx";
  return `${docType}.xlsx`;
}

function parseContentDisposition(cd: string, fallback: string): string {
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return fallback;
    }
  }
  if (match?.[2]) return match[2];
  return fallback;
}

function isOptionalExportError(docType: TdDocType, message: string): boolean {
  if (docType === "poruchenie") {
    return message.includes("Нет поручений") || message.includes("Нет документов");
  }
  if (docType === "writeoff") {
    return message.includes("Нет документов");
  }
  return false;
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
    body: JSON.stringify({ jobId: Number(jobId), docType, draft }),
  });

  const contentType = res.headers.get("Content-Type") ?? "";

  if (!res.ok) {
    const data = contentType.includes("json") ? await res.json().catch(() => ({})) : {};
    throw new Error(
      typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : `HTTP ${res.status}`,
    );
  }

  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "Ошибка выгрузки");
  }

  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error("Пустой файл — повторите «Подготовить ТД»");
  }

  const fileName = parseContentDisposition(res.headers.get("Content-Disposition") ?? "", defaultFileName(docType));
  return { blob, fileName };
}

async function addBlobToZip(
  zip: import("jszip"),
  blob: Blob,
  fileName: string,
): Promise<number> {
  if (fileName.toLowerCase().endsWith(".zip")) {
    const JSZip = (await import("jszip")).default;
    const inner = await JSZip.loadAsync(blob);
    let added = 0;
    for (const [name, file] of Object.entries(inner.files)) {
      if (file.dir) continue;
      zip.file(name, await file.async("uint8array"));
      added++;
    }
    return added;
  }
  zip.file(fileName, await blob.arrayBuffer());
  return 1;
}

/** Собирает ZIP на клиенте — обходит лимит ответа Vercel (~4.5 МБ) для docType=all. */
export async function exportTdAllZip(
  auth: AuthData,
  jobId: string,
  draft?: TdDraft,
): Promise<{ blob: Blob; fileName: string }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let fileCount = 0;

  const parts: TdDocType[] = ["specification", "proforma", "writeoff", "poruchenie"];
  for (const docType of parts) {
    try {
      const { blob, fileName } = await exportTdDocument(auth, jobId, docType, draft);
      fileCount += await addBlobToZip(zip, blob, fileName);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "";
      if (isOptionalExportError(docType, msg)) continue;
      throw e;
    }
  }

  if (fileCount === 0) {
    throw new Error("Нет документов для выгрузки — сначала нажмите «Подготовить ТД»");
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { blob, fileName: "ТД-документы.zip" };
}

export function downloadTdBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 200);
}
