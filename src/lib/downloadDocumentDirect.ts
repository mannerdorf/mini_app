import { PROXY_API_DOWNLOAD_URL } from "../constants/config";
import { decodeBase64Payload } from "../utils";
import { buildDownloadRequestBody } from "./downloadRequestBody";
import { toAbsoluteApiUrl } from "./absoluteApiUrl";
import { isCapacitorNative } from "./capacitorPlatform";
import { saveBlobFile } from "./saveBlobFile";
import { transliterateFilename } from "./formatUtils";
import { buildClientDownloadCurl, buildExpectedGetFileCurl, type DocumentDownloadDebug } from "./documentDownloadDebug";
import type { AuthData } from "../types";

export type DownloadDocumentParams = {
  metod: string;
  number: string;
  dateDoc?: string | null;
  dateDog?: string | null;
  inn?: string | null;
};

type DownloadDocumentPayload = {
  data?: string;
  name?: string;
  isHtml?: boolean;
  message?: string;
  error?: string;
  debug?: Omit<DocumentDownloadDebug, "ok" | "httpStatus" | "client_curl" | "client_body">;
};

export type FetchDocumentDetailedResult = {
  ok: boolean;
  status: number;
  blob?: Blob;
  fileName?: string;
  isHtml?: boolean;
  error?: string;
  debug: DocumentDownloadDebug;
};

function downloadUrl(): string {
  return isCapacitorNative() ? toAbsoluteApiUrl(PROXY_API_DOWNLOAD_URL) : PROXY_API_DOWNLOAD_URL;
}

/** POST /api/download с debug (curl + ответ 1С). */
export async function fetchDownloadDocumentDetailed(
  auth: AuthData | null | undefined,
  params: DownloadDocumentParams,
): Promise<FetchDocumentDetailedResult> {
  const payload = {
    metod: params.metod,
    number: params.number,
    ...(params.dateDoc ? { dateDoc: params.dateDoc } : {}),
    ...(params.dateDog ? { dateDog: params.dateDog } : {}),
    ...(params.inn ? { inn: params.inn } : {}),
  };
  const body =
    auth?.login && auth?.password ? buildDownloadRequestBody(auth, payload) : payload;
  const url = downloadUrl();
  const clientCurl = buildClientDownloadCurl(url, body as Record<string, unknown>);
  const clientBody = { ...(body as Record<string, unknown>) };
  if ("password" in clientBody) clientBody.password = "***";
  const expected = buildExpectedGetFileCurl({
    metod: params.metod,
    number: params.number,
    dateDoc: params.dateDoc,
    dateDog: params.dateDog,
    inn: params.inn,
  });

  const baseDebug = (partial: Partial<DocumentDownloadDebug>, status: number, ok: boolean): DocumentDownloadDebug => ({
    ok,
    httpStatus: status,
    metod: params.metod,
    number: params.number,
    ...(params.dateDoc ? { dateDoc: params.dateDoc } : {}),
    auth_mode: expected.auth_mode,
    upstream_url: expected.url,
    upstream_curl: expected.curl,
    client_curl: clientCurl,
    client_body: clientBody,
    ...partial,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    return {
      ok: false,
      status: 0,
      error: (e as Error)?.message ?? "Сеть недоступна",
      debug: baseDebug(
        {
          error: "network",
          message: (e as Error)?.message,
          upstream_response_summary: (e as Error)?.message,
        },
        0,
        false,
      ),
    };
  }

  let data: DownloadDocumentPayload = {};
  try {
    data = (await res.json()) as DownloadDocumentPayload;
  } catch {
    const textHint =
      res.status === 504
        ? "Gateway timeout: шлюз оборвал ответ до JSON от /api/download (часто долгий GetFile Счёт/УПД). Ниже — ожидаемый curl в 1С."
        : "Некорректный ответ API (не JSON)";
    return {
      ok: false,
      status: res.status,
      error: res.status === 504 ? "Ошибка сервера (таймаут)" : "Некорректный ответ API",
      debug: baseDebug(
        {
          error: "invalid_json",
          message: textHint,
          upstream_status: res.status,
          upstream_response_summary: textHint,
        },
        res.status,
        false,
      ),
    };
  }

  const serverDebug = data.debug ?? {};
  const debug = baseDebug(
    {
      ...serverDebug,
      // Серверный curl приоритетнее ожидаемого
      upstream_curl: serverDebug.upstream_curl || expected.curl,
      upstream_url: serverDebug.upstream_url || expected.url,
      auth_mode: serverDebug.auth_mode || expected.auth_mode,
      error: data.error,
      message: data.message,
    },
    res.status,
    res.ok && Boolean(data.data && data.name),
  );

  if (!res.ok) {
    let msg =
      res.status === 404
        ? "Документ не найден"
        : res.status >= 500
          ? "Ошибка сервера"
          : "Не удалось получить документ";
    if (data?.message && res.status !== 404 && res.status < 500) msg = String(data.message);
    else if (data?.error && res.status !== 404 && res.status < 500) msg = String(data.error);
    else if (res.status === 404 && data?.message) msg = String(data.message);
    else if (res.status === 404 && data?.error) {
      msg = /^file not found$/i.test(String(data.error)) ? "Файл не найден" : String(data.error);
    }
    return { ok: false, status: res.status, error: msg, debug };
  }

  if (!data?.data || !data.name) {
    return { ok: false, status: res.status, error: "Документ не найден", debug };
  }

  const byteArray = decodeBase64Payload(String(data.data));
  const mime = data.isHtml ? "text/html;charset=utf-8" : "application/pdf";
  return {
    ok: true,
    status: res.status,
    blob: new Blob([byteArray], { type: mime }),
    fileName: transliterateFilename(data.name || `${params.metod}_${params.number}.pdf`),
    isHtml: Boolean(data.isHtml),
    debug,
  };
}

/** POST /api/download через fetch (как до preview/GET-экспериментов). */
export async function fetchDownloadDocument(body: Record<string, unknown>): Promise<DownloadDocumentPayload> {
  const url = downloadUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg =
      res.status === 404
        ? "Документ не найден"
        : res.status >= 500
          ? "Ошибка сервера"
          : "Не удалось получить документ";
    try {
      const errData = (await res.json()) as DownloadDocumentPayload;
      if (errData?.message && res.status !== 404 && res.status < 500) {
        msg = String(errData.message);
      } else if (errData?.error && res.status !== 404 && res.status < 500) {
        msg = String(errData.error);
      } else if (res.status === 404 && errData?.message) {
        msg = String(errData.message);
      } else if (res.status === 404 && errData?.error) {
        msg = /^file not found$/i.test(String(errData.error)) ? "Файл не найден" : String(errData.error);
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as DownloadDocumentPayload;
  if (!data?.data || !data.name) throw new Error("Документ не найден");
  return data;
}

/** Скачать документ: POST JSON → base64 → Share / «Сохранить». */
export async function downloadDocumentDirect(
  auth: AuthData | null | undefined,
  params: DownloadDocumentParams,
): Promise<void> {
  const detailed = await fetchDownloadDocumentDetailed(auth, params);
  if (!detailed.ok || !detailed.blob || !detailed.fileName) {
    throw new Error(detailed.error ?? "Документ не найден");
  }
  if (detailed.isHtml) {
    await saveBlobFile(detailed.blob, detailed.fileName);
    return;
  }
  await saveBlobFile(detailed.blob, detailed.fileName);
}

/** Формат dateDoc для API: YYYY-MM-DDTHH:MM:SS (как в актах сверки). */
export function formatDateDocForDownloadApi(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}T00:00:00`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}T00:00:00`;
  }
  return null;
}
