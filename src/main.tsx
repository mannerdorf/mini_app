import React from "react";
import ReactDOM from "react-dom/client";
import { SWRConfig } from "swr";
import { MaxUI } from "@maxhub/max-ui";
import "@maxhub/max-ui/dist/styles.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "./design-tokens.css";
import "./styles.css";
import "./components/shipment-status.css";

const swrConfig = {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60 * 1000,
};

const shouldShowDebug = () => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
};

declare global {
  interface Window {
    __haulzWebAppSdkReady?: Promise<void>;
    __debugLog?: (label: string, data?: unknown) => void;
    Capacitor?: {
      isNativePlatform?: () => boolean;
    };
  }
}

const setupDebugOverlay = () => {
  if (!shouldShowDebug()) return;
  const container = document.createElement("div");
  container.id = "debug-overlay";
  Object.assign(container.style, {
    position: "fixed",
    zIndex: "99999",
    inset: "0",
    overflow: "auto",
    background: "transparent",
    color: "#fff",
    padding: "16px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "12px",
    whiteSpace: "pre-wrap",
    opacity: "0",
    pointerEvents: "none",
    transition: "opacity 120ms ease",
  });
  document.body.appendChild(container);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Debug";
  Object.assign(toggle.style, {
    position: "fixed",
    zIndex: "100000",
    right: "12px",
    top: "12px",
    padding: "6px 8px",
    fontSize: "12px",
    borderRadius: "8px",
    border: "1px solid #444",
    background: "#111",
    color: "#fff",
  });
  document.body.appendChild(toggle);

  let isExpanded = false;
  const setExpanded = (value: boolean) => {
    isExpanded = value;
    container.style.opacity = isExpanded ? "1" : "0";
    container.style.pointerEvents = isExpanded ? "auto" : "none";
    container.style.background = isExpanded ? "rgba(0, 0, 0, 0.92)" : "transparent";
  };
  toggle.addEventListener("click", () => setExpanded(!isExpanded));

  const write = (label: string, data?: unknown) => {
    const message =
      data instanceof Error
        ? `${data.message}\n${data.stack ?? ""}`
        : data === undefined
          ? ""
          : typeof data === "string"
            ? data
            : JSON.stringify(data, null, 2);
    const time = new Date().toISOString();
    container.textContent += `\n[${time}] ${label}\n${message}\n`;
    setExpanded(true);
  };

  window.__debugLog = write;
  write("debug enabled");

  window.addEventListener("error", (event) => {
    write("window.error", (event as ErrorEvent).error || event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    write("unhandledrejection", (event as PromiseRejectionEvent).reason);
  });
};

setupDebugOverlay();

/** VPS/legacy API; нативное приложение. Веб на Vercel — same-origin /api без переписывания. */
const FALLBACK_API_ORIGIN = "https://api.haulz.ru";

/** Статика на haulz.ru (Caddy/nginx); POST /api/* на этом хосте даёт 405 — API на api.haulz.ru. */
const HAULZ_STATIC_ORIGINS = new Set([
  "https://haulz.ru",
  "http://haulz.ru",
  "https://www.haulz.ru",
  "http://www.haulz.ru",
]);

const normalizeOrigin = (value: string): string => value.trim().replace(/\/+$/, "");

const isCapacitorNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  if (protocol === "capacitor:" || protocol === "ionic:") return true;
  return typeof window.Capacitor?.isNativePlatform === "function" ? !!window.Capacitor.isNativePlatform() : false;
};

const resolveApiOrigin = (): string => {
  const envOrigin = normalizeOrigin(String(import.meta.env.VITE_API_ORIGIN || ""));
  if (envOrigin) return envOrigin;
  if (typeof window !== "undefined" && !isCapacitorNative()) {
    const pageOrigin = normalizeOrigin(window.location.origin);
    if (HAULZ_STATIC_ORIGINS.has(pageOrigin)) return FALLBACK_API_ORIGIN;
    return pageOrigin;
  }
  return FALLBACK_API_ORIGIN;
};

const rewriteNativeApiUrl = (url: string, apiOrigin: string): string => {
  if (!url) return url;
  if (url.startsWith(`${apiOrigin}/api`)) return url;
  if (url.startsWith("/api/") || url === "/api") return `${apiOrigin}${url}`;

  const localhostApiMatch = url.match(
    /^(?:capacitor:\/\/localhost|https?:\/\/localhost(?::\d+)?)(\/api(?:\/.*)?$)/i
  );
  if (localhostApiMatch?.[1]) return `${apiOrigin}${localhostApiMatch[1]}`;
  return url;
};

const installFetchRewrite = (apiOrigin: string) => {
  if (typeof window === "undefined") return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") return originalFetch(rewriteNativeApiUrl(input, apiOrigin), init);
    if (input instanceof URL) return originalFetch(rewriteNativeApiUrl(input.toString(), apiOrigin), init);
    if (input instanceof Request) {
      const rewrittenUrl = rewriteNativeApiUrl(input.url, apiOrigin);
      if (rewrittenUrl !== input.url) return originalFetch(new Request(rewrittenUrl, input), init);
    }
    return originalFetch(input, init);
  };
};

const isLikelyLocalDev = (): boolean => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local");
};

/**
 * /api/* → serverless functions в api/*.ts (Vercel) на том же origin, что и фронт.
 * Переписываем fetch только если API на другом хосте: VITE_API_ORIGIN, Capacitor → FALLBACK/VITE.
 * Статика на haulz.ru + API на Vercel: задайте VITE_API_ORIGIN=https://<project>.vercel.app при сборке.
 */
if (typeof window !== "undefined") {
  const apiOrigin = resolveApiOrigin();
  const pageOrigin = normalizeOrigin(window.location.origin);
  if (apiOrigin !== pageOrigin) {
    installFetchRewrite(apiOrigin);
  }
}

/** Дождаться условной загрузки Telegram/MAX SDK из index.html, затем монтировать React. */
const mountApp = () => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <SWRConfig value={swrConfig}>
          <MaxUI>
            <App />
          </MaxUI>
        </SWRConfig>
      </ErrorBoundary>
    </React.StrictMode>
  );
};

void (async () => {
  try {
    await (typeof window !== "undefined" ? window.__haulzWebAppSdkReady ?? Promise.resolve() : Promise.resolve());
  } catch {
    /* загрузчик сам логирует предупреждения */
  }
  mountApp();
})();
