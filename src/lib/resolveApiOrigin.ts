import { APP_API_PUBLIC_ORIGIN } from "../constants/partnerApi";

const FALLBACK_API_ORIGIN = APP_API_PUBLIC_ORIGIN;

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

/** Базовый origin для fetch `/api/*` — совпадает с логикой `src/main.tsx`. */
export function resolveApiOrigin(): string {
  const envOrigin = normalizeApiOrigin(String(import.meta.env.VITE_API_ORIGIN || ""));
  if (envOrigin) return envOrigin;
  if (typeof window !== "undefined" && !isCapacitorNative()) {
    return normalizeOrigin(window.location.origin);
  }
  return FALLBACK_API_ORIGIN;
}
