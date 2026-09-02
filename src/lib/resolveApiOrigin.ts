import { usesSameOriginBrowserApi } from "../../lib/haulzDomains";
import { PARTNER_API_PUBLIC_ORIGIN } from "../constants/partnerApi";

const FALLBACK_API_ORIGIN = PARTNER_API_PUBLIC_ORIGIN;

const normalizeOrigin = (value: string): string => value.trim().replace(/\/+$/, "");

const normalizeApiOrigin = (value: string): string => {
  let v = normalizeOrigin(value);
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `https://${v.replace(/^\/+/, "")}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
};

const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  if (protocol === "capacitor:" || protocol === "ionic:") return true;
  return typeof window.Capacitor?.isNativePlatform === "function" ? !!window.Capacitor.isNativePlatform() : false;
};

/**
 * haulz.space / haulz.ru сейчас отвечают 301 на api.haulz.space.
 * fetch превращает POST+301 в GET → 405 Method not allowed на /api/perevozki.
 */
const resolveAwayFromFrontRedirect = (origin: string): string => {
  const n = normalizeApiOrigin(origin);
  if (!n) return "";
  if (usesSameOriginBrowserApi(n)) return FALLBACK_API_ORIGIN;
  return n;
};

/**
 * Базовый origin для fetch `/api/*`.
 * Всегда api.haulz.space для production-фронта / Capacitor / Vercel preview.
 * Локальный Vite остаётся на origin страницы.
 */
export function resolveApiOrigin(): string {
  const envOrigin = resolveAwayFromFrontRedirect(String(import.meta.env.VITE_API_ORIGIN || ""));
  if (envOrigin) return envOrigin;
  if (typeof window !== "undefined" && !isCapacitorNative()) {
    const pageOrigin = normalizeOrigin(window.location.origin);
    if (usesSameOriginBrowserApi(pageOrigin)) return FALLBACK_API_ORIGIN;
    try {
      const host = new URL(pageOrigin).hostname.toLowerCase();
      if (host === "vercel.app" || host.endsWith(".vercel.app")) {
        return FALLBACK_API_ORIGIN;
      }
    } catch {
      // ignore
    }
    return pageOrigin;
  }
  return FALLBACK_API_ORIGIN;
}
