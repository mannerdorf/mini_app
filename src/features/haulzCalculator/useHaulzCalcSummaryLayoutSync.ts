import { useEffect, type RefObject } from "react";

const DESKTOP_MQ = "(min-width: 769px)";

function measureCssLength(value: string, context?: HTMLElement): number {
  if (typeof document === "undefined") return 16;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;";
  probe.style.width = value;
  (context ?? document.body).appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px || 16;
}

function measureCmPx(cm: number): number {
  return measureCssLength(`${cm}cm`);
}

function readSummaryGapPx(root: HTMLElement): number {
  const raw = getComputedStyle(root).getPropertyValue("--haulz-docs-summary-gap").trim() || "1rem";
  return measureCssLength(raw, root);
}

/** Синхронизирует fixed «Ваш расчёт» с первой карточкой формы (top) и колонкой формы (left + gap). */
export function useHaulzCalcSummaryLayoutSync(
  formRef: RefObject<HTMLElement | null>,
  anchorRef: RefObject<HTMLElement | null>,
  mainRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const root = formRef.current;
    const anchor = anchorRef.current;
    const main = mainRef.current;
    if (!root || !anchor || !main) return;

    const mq = window.matchMedia(DESKTOP_MQ);
    const headerGapPx = measureCmPx(1);

    const clear = () => {
      root.style.removeProperty("--haulz-docs-summary-sync-top");
      root.style.removeProperty("--haulz-docs-summary-sync-left");
    };

    const update = () => {
      if (!mq.matches) {
        clear();
        return;
      }

      const summaryGapPx = readSummaryGapPx(root);

      const header = document.querySelector(".app-header");
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const minTop = headerBottom + headerGapPx;
      const anchorTop = anchor.getBoundingClientRect().top;
      const top = Math.max(minTop, anchorTop);
      root.style.setProperty("--haulz-docs-summary-sync-top", `${Math.round(top)}px`);

      const left = main.getBoundingClientRect().right + summaryGapPx;
      root.style.setProperty("--haulz-docs-summary-sync-left", `${Math.round(left)}px`);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    ro.observe(main);
    const header = document.querySelector(".app-header");
    if (header) ro.observe(header);

    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    mq.addEventListener("change", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      mq.removeEventListener("change", update);
      clear();
    };
  }, [formRef, anchorRef, mainRef]);
}
