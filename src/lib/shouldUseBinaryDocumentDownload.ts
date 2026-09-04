import { isCapacitorNative } from "./capacitorPlatform";
import { isMaxWebApp } from "../webApp";

/** MAX / Telegram mini-app WebView: POST+base64 через мост ненадёжен, GET → PDF (см. api/download). */
export function isMiniAppWebView(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Telegram?.WebApp || (window as Window & { WebApp?: unknown }).WebApp);
}

export function shouldUseBinaryDocumentDownload(): boolean {
  return isCapacitorNative() || isMaxWebApp() || isMiniAppWebView();
}
