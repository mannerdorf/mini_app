import React from "react";
import ReactDOM from "react-dom/client";
import { MaxUI } from "@maxhub/max-ui";
import "@maxhub/max-ui/dist/styles.css";
import App from "./App";
import "./styles.css";

const shouldShowDebug = () => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
};

declare global {
  interface Window {
    __debugLog?: (label: string, data?: unknown) => void;
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MaxUI>
      <App />
    </MaxUI>
  </React.StrictMode>
);
