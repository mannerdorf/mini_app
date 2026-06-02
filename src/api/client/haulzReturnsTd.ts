import type { AuthData } from "../../types";
import type { TdDocType, TdDraft, TdPrepared } from "../../../lib/haulzReturns/tdDocuments/index";
import { proformaExportFileName, specificationExportFileName, writeoffExportFileName, poruchenieExportFileName, tdAllDocumentsZipFileName } from "../../../lib/haulzReturns/tdDocuments/fileNames";
import { resolveHeaderTdFromDraft } from "../../../lib/haulzReturns/tdDocuments/resolveTdDraft";
import { PORUCHENIE_MERGED_DRAFT_KEY, defaultPoruchenieDate } from "../../../lib/haulzReturns/tdDocuments/formatPoruchenieDraft";
import { triggerBlobDownload } from "../../lib/triggerBlobDownload";

export type TdExportRequest = {
  jobId: string;
  docType: TdDocType;
  draft?: TdDraft;
  tdPrepared?: TdPrepared;
  /** Для поручения — скачать только выбранный УЛ. */
  ulNumber?: string;
};

function authHeaders(auth: AuthData): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
  };
}

function resolveAllZipFileName(draft?: TdDraft, tdPrepared?: TdPrepared): string {
  const specification = {
    ...(tdPrepared?.draft?.specification ?? {}),
    ...(draft?.specification ?? {}),
  };
  return tdAllDocumentsZipFileName(resolveHeaderTdFromDraft(specification));
}

function defaultFileName(docType: TdDocType, draft?: TdDraft, tdPrepared?: TdPrepared): string {
  if (docType === "all") return resolveAllZipFileName(draft, tdPrepared);
  if (docType === "proforma") {
    const title = draft?.proforma?.title?.trim();
    return title ? proformaExportFileName(title) : "Schet-proforma.xlsx";
  }
  if (docType === "specification") {
    const title = draft?.specification?.title?.trim();
    return title ? specificationExportFileName(title) : "Spetsifikatsiya.xlsx";
  }
  if (docType === "poruchenie") {
    const merged = draft?.poruchenie?.[PORUCHENIE_MERGED_DRAFT_KEY];
    const number = merged?.number?.trim() || "1";
    const date = merged?.date?.trim() || defaultPoruchenieDate(draft?.specification ?? {});
    return poruchenieExportFileName(number, date);
  }
  if (docType === "writeoff") {
    const title = draft?.specification?.title?.trim();
    return title ? writeoffExportFileName(title) : writeoffExportFileName("");
  }
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
  request: TdExportRequest,
): Promise<{ blob: Blob; fileName: string }> {
  const { jobId, docType, draft, tdPrepared, ulNumber } = request;
  const res = await fetch("/api/haulz-returns/td-export", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({
      jobId: Number(jobId),
      docType,
      draft,
      ulNumber,
    }),
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

  const buffer = await res.arrayBuffer();
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  if (blob.size === 0) {
    throw new Error("Пустой файл — повторите «Подготовить ТД»");
  }

  const fileName = parseContentDisposition(
    res.headers.get("Content-Disposition") ?? "",
    defaultFileName(docType, draft, tdPrepared),
  );
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

/**
 * Собирает ZIP на клиенте по спецификации:
 * спецификация, проформа, лист списания на каждый УЛ (имя = номер УЛ), поручения.
 */
export async function exportTdAllZip(
  auth: AuthData,
  jobId: string,
  draft?: TdDraft,
  tdPrepared?: TdPrepared,
): Promise<{ blob: Blob; fileName: string }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let fileCount = 0;
  const base = { jobId, draft, tdPrepared };

  const parts: TdDocType[] = ["specification", "proforma", "writeoff", "poruchenie"];

  for (const docType of parts) {
    try {
      const { blob, fileName } = await exportTdDocument(auth, { ...base, docType });
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
    mimeType: "application/octet-stream",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { blob, fileName: resolveAllZipFileName(draft, tdPrepared) };
}

export function downloadTdBlob(blob: Blob, fileName: string) {
  triggerBlobDownload(blob, fileName);
}
