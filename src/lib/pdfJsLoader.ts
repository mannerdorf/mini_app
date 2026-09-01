import type * as PdfJsModule from "pdfjs-dist";

let pdfJsPromise: Promise<typeof PdfJsModule> | null = null;

export function loadPdfJs(): Promise<typeof PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjs;
    })();
  }
  return pdfJsPromise;
}
