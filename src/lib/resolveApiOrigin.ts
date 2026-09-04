import { DEFAULT_APP_URL, usesSameOriginBrowserApi } from "../../lib/haulzDomains";
import { isCapacitorNative } from "./capacitorPlatform";

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

/**
 * Базовый origin для fetch `/api/*`.
 * Браузер на haulz.space / haulz.ru → same-origin (nginx проксирует /api на VPS).
 * Capacitor (iOS/Android) → https://haulz.space (не api.haulz.space — там нестабильный TLS).
 * Vercel preview → haulz.space.
 */
export function resolveApiOrigin(): string {
  const envOrigin = normalizeApiOrigin(String(import.meta.env.VITE_API_ORIGIN || ""));

  if (isCapacitorNative()) {
    if (envOrigin && !usesSameOriginBrowserApi(envOrigin)) return envOrigin;
    return envOrigin || DEFAULT_APP_URL;
  }

  if (envOrigin) return envOrigin;
  if (typeof window !== "undefined") {
    const pageOrigin = normalizeOrigin(window.location.origin);
    if (usesSameOriginBrowserApi(pageOrigin)) return pageOrigin;
    try {
      const host = new URL(pageOrigin).hostname.toLowerCase();
      if (host === "vercel.app" || host.endsWith(".vercel.app")) {
        return DEFAULT_APP_URL;
      }
    } catch {
      // ignore
    }
    return pageOrigin;
  }
  return DEFAULT_APP_URL;
}
