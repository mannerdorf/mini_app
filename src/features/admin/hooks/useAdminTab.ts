import { useCallback, useEffect, useState } from "react";

export const ADMIN_TAB_KEY = "haulz.admin.tab";

export const ADMIN_TABS = [
  "users",
  "templates",
  "customers",
  "suppliers",
  "tariffs",
  "sverki",
  "dogovors",
  "ferries",
  "haulz_calculator",
  "pvz",
  "audit",
  "logs",
  "integrations",
  "legal",
  "employee_directory",
  "subdivisions",
  "presets",
  "payment_calendar",
  "work_schedule",
  "timesheet",
  "expense_requests",
  "accounting",
  "claims",
  "dashboards",
  "pnl",
  "haulz_sandbox",
  "haulz_summary",
  "fivepost",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

function getInitialAdminTab(): AdminTab {
  if (typeof window === "undefined") return "users";
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("admin");
    if (fromUrl && ADMIN_TABS.includes(fromUrl as AdminTab)) return fromUrl as AdminTab;
    const fromStorage = localStorage.getItem(ADMIN_TAB_KEY);
    if (fromStorage && ADMIN_TABS.includes(fromStorage as AdminTab)) return fromStorage as AdminTab;
  } catch {
    /* ignore */
  }
  return "users";
}

export function useAdminTab() {
  const [tab, setTabState] = useState<AdminTab>(getInitialAdminTab);

  const setTab = useCallback((next: AdminTab) => {
    setTabState(next);
    try {
      localStorage.setItem(ADMIN_TAB_KEY, next);
      const url = new URL(window.location.href);
      url.searchParams.set("admin", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const fromUrl = url.searchParams.get("admin");
      if (fromUrl && ADMIN_TABS.includes(fromUrl as AdminTab)) {
        setTabState((prev) => (prev !== fromUrl ? (fromUrl as AdminTab) : prev));
      } else {
        const fromStorage = localStorage.getItem(ADMIN_TAB_KEY);
        if (fromStorage && ADMIN_TABS.includes(fromStorage as AdminTab)) {
          setTabState((prev) => (prev !== fromStorage ? (fromStorage as AdminTab) : prev));
          url.searchParams.set("admin", fromStorage);
          window.history.replaceState(null, "", url.toString());
        }
      }
    } catch {
      /* ignore */
    }
    const onPopState = () => {
      try {
        const url = new URL(window.location.href);
        const fromUrl = url.searchParams.get("admin");
        if (fromUrl && ADMIN_TABS.includes(fromUrl as AdminTab)) {
          setTabState(fromUrl as AdminTab);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return { tab, setTab };
}
