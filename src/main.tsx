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
import "@fontsource/manrope/800.css";
import "./design-tokens.css";
import "./styles.css";
import "./components/shipment-status.css";
import "./styles/haulz-calculator.css";
import { clearChunkReloadState, isChunkLoadError, reloadForStaleChunks } from "./lib/chunkLoadRecovery";
import { resolveApiOrigin } from "./lib/resolveApiOrigin";

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

const rewriteNativeApiUrl = (url: string, apiOrigin: string): string => {
  if (!url) return url;
  const base = normalizeApiOrigin(apiOrigin);
  if (!base) return url;
  if (url.startsWith(`${base}/api`)) return url;
  if (url.startsWith("/api/") || url === "/api") return `${base}${url}`;

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
 * Переписываем fetch только если API на другом хосте (VITE_API_ORIGIN, Capacitor).
 * haulz.space / haulz.ru → same-origin /api/* (nginx → api.haulz.space).
 */
if (typeof window !== "undefined") {
  const apiOrigin = resolveApiOrigin();
  const pageOrigin = normalizeOrigin(window.location.origin);
  if (apiOrigin !== pageOrigin) {
    installFetchRewrite(apiOrigin);
  }

  clearChunkReloadState();

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadForStaleChunks("vite:preloadError");
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      reloadForStaleChunks("unhandledrejection");
    }
  });
}

/** Дождаться условной загрузки Telegram/MAX SDK из index.html, затем монтировать React. */
const mountApp = () => {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    console.error("[HAULZ] #root not found");
    return;
  }

  ReactDOM.createRoot(rootEl).render(
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

const startApp = async () => {
  try {
    await (typeof window !== "undefined" ? window.__haulzWebAppSdkReady ?? Promise.resolve() : Promise.resolve());
  } catch {
    /* загрузчик сам логирует предупреждения */
  }
  try {
    mountApp();
  } catch (error) {
    console.error("[HAULZ] mount failed", error);
    const rootEl = document.getElementById("root");
    if (rootEl && rootEl.childElementCount === 0) {
      rootEl.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f3f4f6;color:#111827;font-family:Inter,system-ui,sans-serif;text-align:center">' +
        '<div><p style="font-size:18px;font-weight:700;margin:0 0 8px">Не удалось загрузить приложение</p>' +
        '<p style="font-size:14px;margin:0 0 16px;color:#6b7280">Обновите страницу или очистите кэш браузера.</p>' +
        '<button type="button" onclick="location.reload()" style="border:0;border-radius:12px;background:#2563eb;color:#fff;font-size:14px;font-weight:600;padding:10px 18px;cursor:pointer">Обновить</button></div></div>';
    }
  }
};

if (typeof document !== "undefined" && document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void startApp();
  });
} else {
  void startApp();
}
