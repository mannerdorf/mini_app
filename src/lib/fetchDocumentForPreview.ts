import { apiFetch, apiFetchJson, decodeBase64Payload } from "../utils";
import { toAbsoluteApiUrl } from "./absoluteApiUrl";
import { buildDownloadRequestBody } from "./downloadRequestBody";
import { createPdfPreviewFromBlob, type PdfPreviewState } from "./documentPreview";
import { transliterateFilename } from "./formatUtils";
import type { AuthData } from "../types";

export type FetchDocumentParams = {
  metod: string;
  number: string;
  dateDoc?: string | null;
  dateDog?: string | null;
  inn?: string | null;
};

export type FetchDocumentResult = {
  blob: Blob;
  fileName: string;
  isHtml?: boolean;
};

function extractFileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      /* fall through */
    }
  }
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const plainMatch = header.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return fallback;
}

function buildDownloadPayload(params: FetchDocumentParams): Record<string, unknown> {
  return {
    metod: params.metod,
    number: params.number,
    ...(params.dateDoc ? { dateDoc: params.dateDoc } : {}),
    ...(params.dateDog ? { dateDog: params.dateDog } : {}),
    ...(params.inn ? { inn: params.inn } : {}),
  };
}

function buildDownloadQuery(auth: AuthData | null | undefined, params: FetchDocumentParams): URLSearchParams {
  const qs = new URLSearchParams();
  const payload = buildDownloadPayload(params);
  const body =
    auth?.login && auth?.password
      ? buildDownloadRequestBody(auth, payload)
      : payload;
  for (const [key, value] of Object.entries(body)) {
    if (value != null && value !== "") qs.set(key, String(value));
  }
  return qs;
}

/** GET /api/download → бинарный PDF (без base64 JSON через мост Capacitor). */
export async function fetchViaGetBinary(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Promise<FetchDocumentResult> {
  const url = `${toAbsoluteApiUrl("/api/download")}?${buildDownloadQuery(auth, params).toString()}`;
  const res = await apiFetch(url, { method: "GET" });
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(err.message || err.error || "Не удалось получить документ");
  }
  const blob = await res.blob();
  const rawName = extractFileNameFromDisposition(
    res.headers.get("content-disposition"),
    `${params.metod}_${params.number}.pdf`,
  );
  const isHtml = contentType.includes("text/html");
  return {
    blob,
    fileName: transliterateFilename(rawName),
    isHtml,
  };
}

export async function fetchViaPostJson(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Promise<FetchDocumentResult> {
  const payload = buildDownloadPayload(params);
  const body =
    auth?.login && auth?.password
      ? buildDownloadRequestBody(auth, payload)
      : payload;
  const data = await apiFetchJson<{ data?: string; name?: string; isHtml?: boolean }>("/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!data?.data || !data.name) throw new Error("Документ не найден");
  const byteArray = decodeBase64Payload(data.data);
  const mime = data.isHtml ? "text/html;charset=utf-8" : "application/pdf";
  return {
    blob: new Blob([byteArray], { type: mime }),
    fileName: transliterateFilename(data.name),
    isHtml: Boolean(data.isHtml),
  };
}

/** Загрузить документ (GET binary PDF) — рабочий путь для Capacitor и браузера. */
export async function fetchDocumentForPreview(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Promise<FetchDocumentResult> {
  return fetchViaGetBinary(auth, params);
}

/** GET binary → pdf.js inline-просмотр. */
export async function fetchDocumentPdfPreview(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Promise<PdfPreviewState> {
  const { blob, fileName, isHtml } = await fetchViaGetBinary(auth, params);
  if (isHtml) {
    throw new Error("Документ в формате HTML — используйте скачивание");
  }
  return createPdfPreviewFromBlob(blob, fileName);
}
