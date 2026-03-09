import React from "react";
import ReactDOM from "react-dom/client";
import { SWRConfig } from "swr";
import { MaxUI } from "@maxhub/max-ui";
import "@maxhub/max-ui/dist/styles.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./styles.css";

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

const FALLBACK_API_ORIGIN = "https://mini-app-lake-phi.vercel.app";

const normalizeOrigin = (value: string): string => value.trim().replace(/\/+$/, "");

const resolveApiOrigin = (): string => {
  const envOrigin = normalizeOrigin(String(import.meta.env.VITE_API_ORIGIN || ""));
  return envOrigin || FALLBACK_API_ORIGIN;
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

const installNativeApiFetchRewrite = () => {
  if (typeof window === "undefined") return;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  const nativeByProtocol = protocol === "capacitor:" || protocol === "ionic:";
  const nativeByBridge = typeof window.Capacitor?.isNativePlatform === "function"
    ? !!window.Capacitor.isNativePlatform()
    : false;
  if (!nativeByProtocol && !nativeByBridge) return;
  const apiOrigin = resolveApiOrigin();
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

installNativeApiFetchRewrite();

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
