import { useEffect, type RefObject } from "react";

const DESKTOP_MQ = "(min-width: 769px)";

function measureCmPx(cm: number): number {
  if (typeof document === "undefined") return cm * 37.795275591;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;";
  probe.style.width = `${cm}cm`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  document.body.removeChild(probe);
  return px || cm * 37.795275591;
}

/** Фиксирует top у «Ваш расчёт»: не выше 1 см от app-header и не выше карточки «Маршрут». */
export function useDocumentsOrderSummaryTopSync(
  formRef: RefObject<HTMLElement | null>,
  routeRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const root = formRef.current;
    const route = routeRef.current;
    if (!root || !route) return;

    const mq = window.matchMedia(DESKTOP_MQ);
    let gapPx = measureCmPx(1);

    const clear = () => {
      root.style.removeProperty("--haulz-docs-summary-sync-top");
    };

    const update = () => {
      if (!mq.matches) {
        clear();
        return;
      }

      const header = document.querySelector(".app-header");
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const minTop = headerBottom + gapPx;
      const routeTop = route.getBoundingClientRect().top;
      const top = Math.max(minTop, routeTop);

      root.style.setProperty("--haulz-docs-summary-sync-top", `${Math.round(top)}px`);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(route);
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
  }, [formRef, routeRef]);
}
