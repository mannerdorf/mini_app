import { fetchDownloadDocument } from "./downloadDocumentDirect";
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
  const data = await fetchDownloadDocument(body);
  const { decodeBase64Payload } = await import("../utils");
  const byteArray = decodeBase64Payload(String(data.data));
  const mime = data.isHtml ? "text/html;charset=utf-8" : "application/pdf";
  return {
    blob: new Blob([byteArray], { type: mime }),
    fileName: transliterateFilename(data.name || `${params.metod}_${params.number}.pdf`),
    isHtml: Boolean(data.isHtml),
  };
}
