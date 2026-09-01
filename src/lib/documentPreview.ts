import { sanitizeDownloadFileName } from "./saveBlobFile";

export type PdfPreviewState = {
  name: string;
  blob: Blob;
  downloadFileName: string;
};

/** Подготовить PDF для inline-просмотра (pdf.js рендерит blob на всех платформах). */
export async function createPdfPreviewFromBlob(blob: Blob, fileName: string): Promise<PdfPreviewState> {
  const downloadFileName = sanitizeDownloadFileName(fileName);
  return {
    name: downloadFileName,
    blob,
    downloadFileName,
  };
}

export async function revokePdfPreview(_preview: PdfPreviewState | null | undefined): Promise<void> {
  /* blob хранится только в памяти компонента */
}
