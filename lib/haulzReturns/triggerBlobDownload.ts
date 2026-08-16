/** Без octet-stream Yandex/Chrome открывают blob xlsx/docx во встроенном просмотрщике. */
function asAttachmentBlob(blob: Blob): Blob {
  if (blob.type === "application/octet-stream") return blob;
  return new Blob([blob], { type: "application/octet-stream" });
}

type BrowserGlobals = {
  document?: {
    createElement: (tag: string) => {
      href: string;
      download: string;
      rel: string;
      style: { cssText: string };
      click: () => void;
      remove: () => void;
    };
    body: { appendChild: (node: unknown) => void };
  };
  setTimeout?: (fn: () => void, ms: number) => unknown;
};

/** Скачивает blob в фоне, не меняя текущую страницу / вкладку мини-приложения. */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const g = globalThis as BrowserGlobals;
  const doc = g.document;
  if (!doc?.createElement || !doc.body) return;

  const safeName = fileName.trim() || "download.bin";
  const attachment = asAttachmentBlob(blob);
  const url = URL.createObjectURL(attachment);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.rel = "noopener";
  anchor.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none";
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  const later = g.setTimeout ?? setTimeout;
  later(() => URL.revokeObjectURL(url), 120_000);
}
