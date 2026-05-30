import { getWebApp } from "../webApp";

export type ClientPlatform = "ios" | "android" | "desktop" | "unknown";

export type ClientPlatformSource = "telegram" | "max" | "capacitor" | "user-agent" | "unknown";

export type ClientPlatformInfo = {
  platform: ClientPlatform;
  source: ClientPlatformSource;
  /** Сырое значение из WebApp / Capacitor, если есть */
  raw?: string;
};

const normalizeWebAppPlatform = (raw: unknown): ClientPlatform | null => {
  const p = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  if (p === "macos" || p === "tdesktop" || p === "web" || p === "weba") return "desktop";
  return null;
};

const fromUserAgent = (ua: string): ClientPlatform | null => {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS 13+: Macintosh + touch
  if (/macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) {
    return "ios";
  }
  return null;
};

/** Определение iOS / Android / desktop (Telegram → Capacitor → User-Agent). */
export function getClientPlatform(): ClientPlatformInfo {
  if (typeof window === "undefined") {
    return { platform: "unknown", source: "unknown" };
  }

  const webApp = getWebApp();
  const rawWebPlatform = webApp?.platform;
  const fromWebApp = normalizeWebAppPlatform(rawWebPlatform);
  if (fromWebApp === "ios" || fromWebApp === "android") {
    const source: ClientPlatformSource = window.Telegram?.WebApp ? "telegram" : "max";
    return { platform: fromWebApp, source, raw: String(rawWebPlatform) };
  }
  if (fromWebApp === "desktop") {
    return { platform: "desktop", source: "telegram", raw: String(rawWebPlatform) };
  }

  const cap = (window as Window & { Capacitor?: { getPlatform?: () => string; platform?: string } })
    .Capacitor;
  const capRaw = cap?.getPlatform?.() ?? cap?.platform;
  const capNorm = String(capRaw ?? "")
    .trim()
    .toLowerCase();
  if (capNorm === "ios" || capNorm === "android") {
    return { platform: capNorm, source: "capacitor", raw: capRaw };
  }

  const ua = navigator.userAgent || "";
  const fromUa = fromUserAgent(ua);
  if (fromUa) {
    return { platform: fromUa, source: "user-agent", raw: ua };
  }

  if (typeof window !== "undefined" && window.innerWidth >= 768) {
    return { platform: "desktop", source: "user-agent" };
  }

  return { platform: "unknown", source: "unknown" };
}

export function isClientIOS(): boolean {
  return getClientPlatform().platform === "ios";
}

export function isClientAndroid(): boolean {
  return getClientPlatform().platform === "android";
}

export function isClientMobile(): boolean {
  const p = getClientPlatform().platform;
  return p === "ios" || p === "android";
}

/** data-client-platform на <html> для CSS и отладки */
export function applyClientPlatformToDocument(): ClientPlatformInfo {
  const info = getClientPlatform();
  if (typeof document === "undefined") return info;
  const root = document.documentElement;
  root.dataset.clientPlatform = info.platform;
  root.dataset.clientPlatformSource = info.source;
  if (info.raw) root.dataset.clientPlatformRaw = info.raw.slice(0, 120);
  return info;
}
