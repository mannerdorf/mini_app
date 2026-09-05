import { fetchDownloadDocumentDetailed, type DownloadDocumentParams } from "./downloadDocumentDirect";
import type { DocumentDownloadDebug } from "./documentDownloadDebug";
import type { AuthData } from "../types";

export type FetchDocumentResult = {
  blob: Blob;
  fileName: string;
  isHtml?: boolean;
  debug: DocumentDownloadDebug;
};

/** Загрузить документ для просмотра (POST /api/download → base64 → Blob + debug). */
export async function fetchDocumentForPreview(
  auth: AuthData | null | undefined,
  params: DownloadDocumentParams,
): Promise<FetchDocumentResult> {
  const result = await fetchDownloadDocumentDetailed(auth, params);
  if (!result.ok || !result.blob || !result.fileName) {
    const err = new Error(result.error ?? "Документ не найден") as Error & { debug?: DocumentDownloadDebug };
    err.debug = result.debug;
    throw err;
  }
  return {
    blob: result.blob,
    fileName: result.fileName,
    isHtml: result.isHtml,
    debug: result.debug,
  };
}
