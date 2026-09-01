import { Capacitor } from "@capacitor/core";
import { sanitizeDownloadFileName } from "./saveBlobFile";

export type PdfPreviewState = {
  url: string;
  name: string;
  blob: Blob;
  downloadFileName: string;
  revoke?: () => void | Promise<void>;
};

async function blobToBase64Data(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Подготовить PDF для inline-просмотра (web blob URL или native file URL через convertFileSrc). */
export async function createPdfPreviewFromBlob(blob: Blob, fileName: string): Promise<PdfPreviewState> {
  const downloadFileName = sanitizeDownloadFileName(fileName);

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const base64 = await blobToBase64Data(blob);
    const path = `preview/${Date.now()}_${downloadFileName}`;

    const written = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    const url = Capacitor.convertFileSrc(written.uri);
    return {
      url,
      name: downloadFileName,
      blob,
      downloadFileName,
      revoke: async () => {
        try {
          await Filesystem.deleteFile({ path, directory: Directory.Cache });
        } catch {
          /* ignore */
        }
      },
    };
  }

  const url = URL.createObjectURL(blob);
  return {
    url,
    name: downloadFileName,
    blob,
    downloadFileName,
    revoke: () => URL.revokeObjectURL(url),
  };
}

export async function revokePdfPreview(preview: PdfPreviewState | null | undefined): Promise<void> {
  if (!preview?.revoke) return;
  await preview.revoke();
}
