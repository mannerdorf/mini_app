/** Без octet-stream Yandex/Chrome открывают blob xlsx/docx во встроенном просмотрщике. */
function asAttachmentBlob(blob: Blob): Blob {
  if (blob.type === "application/octet-stream") return blob;
  return new Blob([blob], { type: "application/octet-stream" });
}

/** Скачивает blob в фоне, не меняя текущую страницу / вкладку мини-приложения. */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const safeName = fileName.trim() || "download.bin";
  const attachment = asAttachmentBlob(blob);
  const url = URL.createObjectURL(attachment);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.rel = "noopener";
  anchor.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
