import { APP_API_PUBLIC_ORIGIN } from "../constants/partnerApi";

const FALLBACK_API_ORIGIN = APP_API_PUBLIC_ORIGIN;

const HAULZ_STATIC_ORIGINS = new Set([
  "https://haulz.ru",
  "http://haulz.ru",
  "https://www.haulz.ru",
  "http://www.haulz.ru",
]);

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

const isStaticFrontendOrigin = (origin: string): boolean => {
  if (HAULZ_STATIC_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "haulz.ru" || host.endsWith(".haulz.ru") || host.endsWith(".layero.ru");
  } catch {
    return false;
  }
};

const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  if (protocol === "capacitor:" || protocol === "ionic:") return true;
  return typeof window.Capacitor?.isNativePlatform === "function" ? !!window.Capacitor.isNativePlatform() : false;
};

/** Базовый origin для fetch `/api/*` — совпадает с логикой `src/main.tsx`. */
export function resolveApiOrigin(): string {
  const envOrigin = normalizeApiOrigin(String(import.meta.env.VITE_API_ORIGIN || ""));
  if (envOrigin) return envOrigin;
  if (typeof window !== "undefined" && !isCapacitorNative()) {
    const pageOrigin = normalizeOrigin(window.location.origin);
    if (isStaticFrontendOrigin(pageOrigin)) return FALLBACK_API_ORIGIN;
    return pageOrigin;
  }
  return FALLBACK_API_ORIGIN;
}
