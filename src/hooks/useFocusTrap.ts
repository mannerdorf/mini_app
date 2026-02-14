import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])";

function getFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
  );
}

/**
 * Focus trap + Escape: при isOpen фокус уходит в контейнер, Tab циклится внутри, Esc вызывает onClose.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void
): void {
  const previousActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const container = containerRef.current;
    previousActiveRef.current = document.activeElement as HTMLElement | null;

    const focusables = getFocusables(container);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first) {
      first.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || focusables.length === 0) return;
      const current = document.activeElement as HTMLElement | null;
      if (!container.contains(current)) return;
      e.preventDefault();
      const idx = focusables.indexOf(current);
      if (e.shiftKey) {
        const next = idx <= 0 ? last : focusables[idx - 1];
        next?.focus();
      } else {
        const next = idx < 0 || idx >= focusables.length - 1 ? first : focusables[idx + 1];
        next?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActiveRef.current?.focus?.();
    };
  }, [isOpen, onClose, containerRef]);
}
