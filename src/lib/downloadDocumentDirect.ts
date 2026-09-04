import { fetchDocumentForPreview } from "./fetchDocumentForPreview";
import { saveBlobFile } from "./saveBlobFile";
import { isCapacitorNative } from "./capacitorPlatform";
import type { AuthData } from "../types";

export type DownloadDocumentParams = {
  metod: string;
  number: string;
  dateDoc?: string | null;
  dateDog?: string | null;
  inn?: string | null;
};

async function saveFetchedDocument(blob: Blob, fileName: string, isHtml?: boolean): Promise<void> {
  if (isHtml && !isCapacitorNative()) {
    const { downloadBase64File } = await import("../utils");
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    await downloadBase64File({
      data: btoa(binary),
      name: fileName,
      isHtml: true,
    });
    return;
  }
  await saveBlobFile(blob, fileName);
}

/** Скачать документ: на Capacitor — GET бинарный PDF; в браузере — POST JSON. */
export async function downloadDocumentDirect(
  auth: AuthData | null | undefined,
  params: DownloadDocumentParams,
): Promise<void> {
  const { blob, fileName, isHtml } = await fetchDocumentForPreview(auth, params);
  await saveFetchedDocument(blob, fileName, isHtml);
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
