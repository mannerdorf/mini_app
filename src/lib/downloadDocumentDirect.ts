import { PROXY_API_DOWNLOAD_URL } from "../constants/config";
import { decodeBase64Payload, downloadBase64File } from "../utils";
import { buildDownloadRequestBody } from "./downloadRequestBody";
import { toAbsoluteApiUrl } from "./absoluteApiUrl";
import { isCapacitorNative } from "./capacitorPlatform";
import { saveBlobFile } from "./saveBlobFile";
import { transliterateFilename } from "./formatUtils";
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
};

/** POST /api/download через fetch (как до preview/GET-экспериментов). */
export async function fetchDownloadDocument(body: Record<string, unknown>): Promise<DownloadDocumentPayload> {
  const url = isCapacitorNative() ? toAbsoluteApiUrl(PROXY_API_DOWNLOAD_URL) : PROXY_API_DOWNLOAD_URL;
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
  const payload = {
    metod: params.metod,
    number: params.number,
    ...(params.dateDoc ? { dateDoc: params.dateDoc } : {}),
    ...(params.dateDog ? { dateDog: params.dateDog } : {}),
    ...(params.inn ? { inn: params.inn } : {}),
  };
  const body =
    auth?.login && auth?.password ? buildDownloadRequestBody(auth, payload) : payload;
  const data = await fetchDownloadDocument(body);

  if (data.isHtml) {
    await downloadBase64File({
      data: String(data.data),
      name: data.name || `${params.metod}_${params.number}.html`,
      isHtml: true,
    });
    return;
  }

  const byteArray = decodeBase64Payload(String(data.data));
  const blob = new Blob([byteArray], { type: "application/pdf" });
  const fileName = transliterateFilename(data.name || `${params.metod}_${params.number}.pdf`);
  await saveBlobFile(blob, fileName);
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
