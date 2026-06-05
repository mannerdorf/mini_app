import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Tab } from "../types";
import { getWebApp } from "../webApp";
import { HAULZ_SPLASH_BACKGROUND } from "../constants/brand";
import {
  syncAppUrlWithActiveTab,
  wildberriesInitialTabFromUrl,
  TABS_ALLOWED_ON_RESTORE,
} from "../wb/appWb";

export type AppTheme = "light" | "dark";

export type AppShellContextValue = {
  theme: AppTheme;
  setTheme: React.Dispatch<React.SetStateAction<AppTheme>>;
  desktopExpanded: boolean;
  setDesktopExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  activeTab: Tab;
  setActiveTab: React.Dispatch<React.SetStateAction<Tab>>;
  hasRestoredTabRef: React.MutableRefObject<boolean>;
  hasUrlTabOverrideRef: React.MutableRefObject<boolean>;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

function initialActiveTab(): Tab {
  if (typeof window === "undefined") return "cargo";
  const wbTab = wildberriesInitialTabFromUrl();
  if (wbTab) return wbTab;
  try {
    const url = new URL(window.location.href);
    const t = (url.searchParams.get("tab") || "").toLowerCase();
    if (url.searchParams.get("profileView")) return "profile";
    if (t === "profile") return "profile";
    if (t === "cargo") return "cargo";
    if (t === "home" || t === "dashboard") return "dashboard";
    if (t === "docs") return "docs";
    if (t === "expense_requests") return "expense_requests";
  } catch {
    // ignore
  }
  return "cargo";
}

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window === "undefined") return "light";
    try {
      return window.localStorage.getItem("haulz.theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [desktopExpanded, setDesktopExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("haulz.desktop.expanded") === "true";
  });
  const [activeTab, setActiveTab] = useState<Tab>(initialActiveTab);
  const hasRestoredTabRef = useRef(false);
  const hasUrlTabOverrideRef = useRef(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const cls = `${theme}-mode`;
    document.documentElement.className = cls;
    document.body.className = cls;
    try {
      window.localStorage.setItem("haulz.theme", theme);
    } catch {
      // ignore
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", HAULZ_SPLASH_BACKGROUND);
    }
    const webApp = getWebApp();
    if (webApp && typeof webApp.setBackgroundColor === "function") {
      webApp.setBackgroundColor(HAULZ_SPLASH_BACKGROUND);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("haulz.desktop.expanded", String(desktopExpanded));
    } catch {
      // ignore
    }
  }, [desktopExpanded]);

  useEffect(() => {
    if (!hasRestoredTabRef.current) return;
    try {
      window.localStorage.setItem("haulz.lastTab", activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  useEffect(() => {
    syncAppUrlWithActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const t = (url.searchParams.get("tab") || "").toLowerCase();
      if (t) hasUrlTabOverrideRef.current = true;
    } catch {
      // ignore
    }
    const savedTab = window.localStorage.getItem("haulz.lastTab");
    if (savedTab && !hasUrlTabOverrideRef.current) {
      const t = savedTab as Tab;
      if (TABS_ALLOWED_ON_RESTORE.includes(t)) {
        if (t === "docs") setActiveTab("docs");
        else if (t === "home") setActiveTab("dashboard");
        else setActiveTab(t);
      }
    }
    hasRestoredTabRef.current = true;
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      desktopExpanded,
      setDesktopExpanded,
      activeTab,
      setActiveTab,
      hasRestoredTabRef,
      hasUrlTabOverrideRef,
    }),
    [theme, desktopExpanded, activeTab]
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used within AppShellProvider");
  return ctx;
}
