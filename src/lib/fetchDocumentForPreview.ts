import { apiFetchJson, decodeBase64Payload } from "../utils";
import { buildDownloadRequestBody } from "./downloadRequestBody";
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

/** Загрузить документ для просмотра (POST /api/download → base64 → Blob). */
export async function fetchDocumentForPreview(
  auth: AuthData | null | undefined,
  params: FetchDocumentParams,
): Promise<FetchDocumentResult> {
  const payload = {
    metod: params.metod,
    number: params.number,
    ...(params.dateDoc ? { dateDoc: params.dateDoc } : {}),
    ...(params.dateDog ? { dateDog: params.dateDog } : {}),
    ...(params.inn ? { inn: params.inn } : {}),
  };
  const body =
    auth?.login && auth?.password ? buildDownloadRequestBody(auth, payload) : payload;
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
