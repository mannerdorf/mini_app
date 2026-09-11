import { isGuestPublicPath } from "./guestRoutes";

/** Допустимые пути SPA без 404 */
export function isAppPathKnown(path: string): boolean {
  const p = (path || "/").replace(/\/$/, "") || "/";
  if (p === "/" || p === "" || p === "/index.html") return true;
  if (/^\/(admin|cms|wildberries|red-returns)$/i.test(p)) return true;
  return isGuestPublicPath(p);
}

/** Показывать ли 404 по текущему pathname */
export function shouldShowNotFound(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname || "/";
  return !isAppPathKnown(path);
}
