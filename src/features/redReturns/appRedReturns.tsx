/**
 * Режим «Красный возврат»: зарегистрированный пользователь с red_returns
 * сразу попадает на экран возвратов, остальные разделы недоступны (как WB).
 */
import type { Account } from "../../types";

export const RED_RETURNS_PATH = "/red-returns";

export function isRedReturnsPathname(pathname: string): boolean {
  return /^\/red-returns\/?$/i.test(pathname);
}

/** При старте: если открыт /red-returns — режим возвратов. */
export function isRedReturnsEntryFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (isRedReturnsPathname(url.pathname)) return true;
    return (url.searchParams.get("tab") || "").toLowerCase() === "red_returns";
  } catch {
    return false;
  }
}

export function syncRedReturnsUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.pathname = RED_RETURNS_PATH;
    url.searchParams.delete("tab");
    url.searchParams.delete("section");
    url.searchParams.delete("search");
    window.history.replaceState(null, "", url.toString());
  } catch {
    // ignore
  }
}

export function isRedReturnsOnlyAccount(
  activeAccount: Pick<Account, "isRegisteredUser" | "permissions"> | null | undefined,
): boolean {
  if (!activeAccount?.isRegisteredUser) return false;
  const perms = activeAccount.permissions || {};
  if (perms.red_returns !== true) return false;
  if (perms.cms_access === true) return false;
  return true;
}
