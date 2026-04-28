/** Допустимые пути SPA без 404 */
export function isAppPathKnown(path: string): boolean {
  const p = (path || "/").replace(/\/$/, "") || "/";
  return p === "/" || p === "" || p === "/index.html" || /^\/(admin|cms|wildberries)$/i.test(p);
}

/** Показывать ли 404 по текущему pathname */
export function shouldShowNotFound(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname || "/";
  return !isAppPathKnown(path);
}
