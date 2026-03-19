/**
 * Интеграция Wildberries в основное приложение: маршрут /wildberries,
 * пользователь «только WB», синхронизация URL, сброс глобального поиска, шапка.
 */
import React, { useEffect } from "react";
import { Button, Container, Flex } from "@maxhub/max-ui";
import { LogOut } from "lucide-react";
import type { Account, Tab } from "../types";

export const WB_TAB = "wildberries" as const satisfies Tab;

export function isWildberriesTab(tab: Tab): tab is typeof WB_TAB {
  return tab === WB_TAB;
}

/** Путь мини-приложения WB в браузере */
export function isWildberriesPathname(pathname: string): boolean {
  return /^\/wildberries\/?$/i.test(pathname);
}

/**
 * При старте: если открыт /wildberries или ?tab=wildberries — вернуть вкладку WB.
 */
export function wildberriesInitialTabFromUrl(): Tab | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    if (isWildberriesPathname(url.pathname)) return WB_TAB;
    const t = (url.searchParams.get("tab") || "").toLowerCase();
    if (t === "wildberries") return WB_TAB;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Зарегистрированный пользователь с правом wb и без «основных» модулей HAULZ — только экран WB.
 */
export function isWbOnlyAccount(activeAccount: Pick<Account, "isRegisteredUser" | "permissions"> | null | undefined): boolean {
  if (!activeAccount?.isRegisteredUser || activeAccount?.permissions?.wb !== true) return false;
  const perms = activeAccount.permissions || {};
  const hasCoreNonWbAccess = !!(
    perms.cms_access ||
    perms.haulz ||
    perms.eor ||
    perms.accounting ||
    perms.supervisor ||
    perms.analytics
  );
  return !hasCoreNonWbAccess;
}

/**
 * Синхронизация pathname / query с активной вкладкой (как в основном App).
 */
export function syncAppUrlWithActiveTab(activeTab: Tab): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const tabInUrl = url.searchParams.get("tab");
    if (tabInUrl === "cms") return;
    if (activeTab === WB_TAB) {
      url.pathname = "/wildberries";
      url.searchParams.delete("tab");
      window.history.replaceState(null, "", url.toString());
      return;
    }
    if (isWildberriesPathname(url.pathname)) {
      url.pathname = "/";
    }
    const tabForUrl = activeTab === "dashboard" ? "home" : activeTab;
    url.searchParams.set("tab", tabForUrl);
    window.history.replaceState(null, "", url.toString());
  } catch {
    // ignore
  }
}

/** Логотип WB в шапке (public/wb-logo.png). */
export function WbHeaderLogo() {
  return <img src="/wb-logo.png" alt="Wildberries" className="wb-header-logo" />;
}

type WbOnlyAppLayoutProps = {
  desktopExpanded: boolean;
  onLogout: () => void;
  children: React.ReactNode;
};

/** Упрощённая оболочка для пользователя только с доступом WB. */
export function WbOnlyAppLayout({ desktopExpanded, onLogout, children }: WbOnlyAppLayoutProps) {
  return (
    <>
      <Container className="app-container">
        <header className={`app-header${desktopExpanded ? " app-header-wide" : ""}`}>
          <Flex align="center" justify="space-between" className="header-top-row">
            <WbHeaderLogo />
            <Flex align="center" className="space-x-3">
              <Button className="search-toggle-button" onClick={onLogout} title="Выход" aria-label="Выйти">
                <LogOut className="w-5 h-5" />
              </Button>
            </Flex>
          </Flex>
        </header>
        <div className={`app-main${desktopExpanded ? " app-main-wide" : ""}`}>
          <div className="w-full">{children}</div>
        </div>
      </Container>
    </>
  );
}

export function useResetGlobalSearchOnWildberries(
  activeTab: Tab,
  setIsSearchExpanded: (v: boolean | ((p: boolean) => boolean)) => void,
  setSearchText: (t: string) => void,
) {
  useEffect(() => {
    if (!isWildberriesTab(activeTab)) return;
    setIsSearchExpanded(false);
    setSearchText("");
  }, [activeTab, setIsSearchExpanded, setSearchText]);
}

/** Вкладки, разрешённые при восстановлении из localStorage (включая WB). */
export const TABS_ALLOWED_ON_RESTORE: Tab[] = [
  "home",
  "cargo",
  "profile",
  "dashboard",
  "docs",
  "expense_requests",
  WB_TAB,
];
