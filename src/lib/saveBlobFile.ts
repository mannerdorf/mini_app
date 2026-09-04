import { Capacitor } from "@capacitor/core";
import { triggerBlobDownload } from "./triggerBlobDownload";

export function sanitizeDownloadFileName(name: string): string {
  const trimmed = String(name ?? "").trim() || "document.pdf";
  return trimmed.replace(/[/\\?%*:|"<>]/g, "_");
}

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

/** WebView в Capacitor не поддерживает `<a download>` и inline PDF — сохраняем через Filesystem + Share. */
export async function saveBlobFile(blob: Blob, fileName: string): Promise<void> {
  const safeName = sanitizeDownloadFileName(fileName);

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    const base64 = await blobToBase64Data(blob);
    const path = `downloads/${Date.now()}_${safeName}`;

    const written = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    await Share.share({
      title: safeName,
      files: [written.uri],
      dialogTitle: "Сохранить документ",
    });
    return;
  }

  triggerBlobDownload(blob, safeName);
}

/** Inline PDF preview доступен и в браузере, и в Capacitor (через convertFileSrc). */
export function supportsInlinePdfPreview(): boolean {
  return true;
}
