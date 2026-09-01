import { DEFAULT_APP_URL, usesSameOriginBrowserApi } from "../../lib/haulzDomains";
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
 * Базовый origin для fetch `/api/*`.
 * Web на haulz.space / haulz.ru → same-origin (nginx /api → VPS).
 * Vercel preview / *.vercel.app → https://haulz.space (иначе Functions 405 на nested routes).
 * Capacitor (iOS/Android) → api.haulz.space напрямую, без прокси haulz.space.
 */
export function resolveApiOrigin(): string {
  const envOrigin = normalizeApiOrigin(String(import.meta.env.VITE_API_ORIGIN || ""));

  if (isCapacitorNative()) {
    // Старые сборки могли bake-in haulz.space — фронт Timeweb не нужен нативным приложениям.
    if (envOrigin && !usesSameOriginBrowserApi(envOrigin)) return envOrigin;
    return FALLBACK_API_ORIGIN;
  }

  if (envOrigin) return envOrigin;
  if (typeof window !== "undefined" && !isCapacitorNative()) {
    const pageOrigin = normalizeOrigin(window.location.origin);
    if (usesSameOriginBrowserApi(pageOrigin)) return pageOrigin;
    try {
      const host = new URL(pageOrigin).hostname.toLowerCase();
      if (host === "vercel.app" || host.endsWith(".vercel.app")) {
        return normalizeApiOrigin(DEFAULT_APP_URL) || "https://haulz.space";
      }
    } catch {
      // ignore
    }
    return pageOrigin;
  }
  return FALLBACK_API_ORIGIN;
}
