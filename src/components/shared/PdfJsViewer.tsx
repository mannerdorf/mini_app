import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadPdfJs } from "../../lib/pdfJsLoader";

type PdfJsViewerProps = {
  blob: Blob;
  title: string;
  height?: number | string;
};

export function PdfJsViewer({ blob, title, height = 500 }: PdfJsViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const width = el.clientWidth || Math.min(window.innerWidth - 32, 640);
      setContainerWidth(width);
    };

    updateWidth();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateWidth) : null;
    observer?.observe(el);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    if (!containerWidth) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageImages([]);

    const renderPdf = async () => {
      try {
        const pdfjs = await loadPdfJs();
        const data = await blob.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        const images: string[] = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas unavailable");
          }
          await page.render({ canvasContext: context, viewport, canvas }).promise;
          images.push(canvas.toDataURL("image/jpeg", 0.92));
        }

        if (!cancelled) {
          setPageImages(images);
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось показать документ");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void renderPdf();
    return () => {
      cancelled = true;
    };
  }, [blob, containerWidth]);

  return (
    <div
      ref={containerRef}
      className="pdf-js-viewer"
      style={{ height }}
      aria-label={title}
    >
      {loading ? (
        <div className="pdf-js-viewer__state">
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
          <span>Загружаем документ…</span>
        </div>
      ) : null}
      {!loading && error ? (
        <div className="pdf-js-viewer__state pdf-js-viewer__state--error">{error}</div>
      ) : null}
      {!loading && !error
        ? pageImages.map((src, index) => (
            <img
              key={`${title}-${index + 1}`}
              src={src}
              alt={`${title}, страница ${index + 1}`}
              className="pdf-js-viewer__page"
              loading="lazy"
              decoding="async"
            />
          ))
        : null}
    </div>
  );
}
