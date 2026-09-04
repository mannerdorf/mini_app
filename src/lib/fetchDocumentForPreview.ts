import { CapacitorHttp } from "@capacitor/core";
import {
  apiFetch,
  apiFetchJson,
  API_FETCH_TIMEOUT_MS,
  decodeBase64Payload,
  extractErrorMessage,
  humanizeStatus,
} from "../utils";
import { toAbsoluteApiUrl } from "./absoluteApiUrl";
import { isCapacitorNative } from "./capacitorPlatform";
import { buildDownloadRequestBody } from "./downloadRequestBody";
import { shouldUseBinaryDocumentDownload } from "./shouldUseBinaryDocumentDownload";
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

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return String(value);
  }
  return "";
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

function buildDownloadQueryParams(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Record<string, string> {
  const payload = buildDownloadPayload(params);
  const body =
    auth?.login && auth?.password
      ? buildDownloadRequestBody(auth, payload)
      : payload;
  const qs: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value != null && value !== "") qs[key] = String(value);
  }
  return qs;
}

function decodeBinaryPayload(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) throw new Error("Пустой ответ документа");
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed) as { message?: string; error?: string };
      throw new Error(parsed.message || parsed.error || "Не удалось получить документ");
    }
    return decodeBase64Payload(trimmed);
  }
  throw new Error("Не удалось получить документ");
}

function bytesToResult(
  bytes: Uint8Array,
  params: FetchDocumentParams,
  contentType: string,
  contentDisposition: string,
): FetchDocumentResult {
  const isHtml = contentType.includes("text/html");
  const header = bytes.length >= 4 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) : "";
  const mime =
    isHtml || header !== "%PDF"
      ? isHtml
        ? "text/html;charset=utf-8"
        : contentType || "application/octet-stream"
      : "application/pdf";
  const rawName = extractFileNameFromDisposition(
    contentDisposition || null,
    `${params.metod}_${params.number}.pdf`,
  );
  return {
    blob: new Blob([bytes], { type: mime }),
    fileName: transliterateFilename(rawName),
    isHtml,
  };
}

/** Capacitor: GET через CapacitorHttp (arraybuffer), без fetch+blob и POST+base64. */
async function fetchViaCapacitorHttpGet(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Promise<FetchDocumentResult> {
  const url = toAbsoluteApiUrl("/api/download");
  const queryParams = buildDownloadQueryParams(auth, params);

  let res: Awaited<ReturnType<typeof CapacitorHttp.get>>;
  try {
    res = await CapacitorHttp.get({
      url,
      params: queryParams,
      responseType: "arraybuffer",
      connectTimeout: API_FETCH_TIMEOUT_MS,
      readTimeout: API_FETCH_TIMEOUT_MS,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Не удалось получить документ";
    throw new Error(msg);
  }

  const contentType = headerValue(res.headers, "Content-Type");
  if (res.status < 200 || res.status >= 300) {
    const errText =
      extractErrorMessage(res.data) ||
      (typeof res.data === "string" ? res.data.slice(0, 200) : "") ||
      humanizeStatus(res.status);
    throw new Error(errText);
  }

  if (contentType.includes("application/json")) {
    const err = (typeof res.data === "object" && res.data != null ? res.data : {}) as {
      message?: string;
      error?: string;
    };
    throw new Error(err.message || err.error || "Не удалось получить документ");
  }

  const bytes = decodeBinaryPayload(res.data);
  return bytesToResult(
    bytes,
    params,
    contentType,
    headerValue(res.headers, "Content-Disposition"),
  );
}

/** GET /api/download → бинарный PDF (MAX / mini-app WebView). */
async function fetchViaGetBinary(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Promise<FetchDocumentResult> {
  const qs = new URLSearchParams(buildDownloadQueryParams(auth, params)).toString();
  const url = `${toAbsoluteApiUrl("/api/download")}?${qs}`;
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

async function fetchViaPostJson(
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

/** Загрузить документ для просмотра или сохранения. */
export async function fetchDocumentForPreview(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Promise<FetchDocumentResult> {
  if (isCapacitorNative()) {
    return fetchViaCapacitorHttpGet(auth, params);
  }
  if (shouldUseBinaryDocumentDownload()) {
    return fetchViaGetBinary(auth, params);
  }
  return fetchViaPostJson(auth, params);
}
