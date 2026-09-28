import { useEffect } from "react";
import { getWebApp, isMaxWebApp } from "../webApp";
import { applyClientPlatformToDocument } from "../lib/clientPlatform";
import { HAULZ_SPLASH_BACKGROUND } from "../constants/brand";

export function useTelegramWebAppInit(setTheme: (theme: "light" | "dark") => void) {
  useEffect(() => {
    let mounted = true;
    let cleanupHandler: (() => void) | undefined;
    let attempts = 0;

    const initWebApp = () => {
      const webApp = getWebApp();
      if (!webApp || !mounted) return false;

      try {
        if (typeof webApp.ready === "function") {
          webApp.ready();
        }

        if (typeof webApp.setBackgroundColor === "function") {
          webApp.setBackgroundColor(HAULZ_SPLASH_BACKGROUND);
        }
        if (isMaxWebApp()) {
          if (typeof webApp.setHeaderColor === "function") {
            webApp.setHeaderColor("#2563eb");
          }
        }

        if (typeof webApp.expand === "function") {
          webApp.expand();
        }
      } catch {
        // Игнорируем, если WebApp API частично недоступен
      }

      const themeHandler = () => {
        // Prefer explicit user choice; default remains light when nothing saved.
        try {
          const saved = window.localStorage.getItem("haulz.theme");
          if (saved === "dark" || saved === "light") {
            setTheme(saved);
            return;
          }
        } catch {
          // ignore storage errors
        }
        setTheme("light");
      };

      if (typeof webApp.onEvent === "function") {
        webApp.onEvent("themeChanged", themeHandler);
        cleanupHandler = () => webApp.offEvent?.("themeChanged", themeHandler);
      }

      applyClientPlatformToDocument();
      return true;
    };

    if (!initWebApp()) {
      const timer = setInterval(() => {
        attempts += 1;
        const ready = initWebApp();
        if (ready || attempts > 40) {
          clearInterval(timer);
        }
      }, 100);

      return () => {
        mounted = false;
        clearInterval(timer);
        cleanupHandler?.();
      };
    }

    return () => {
      mounted = false;
      cleanupHandler?.();
    };
  }, [setTheme]);
}
