import React, { useEffect, useRef, useState } from "react";
import {
  Bell,
  Loader2,
  LogOut,
  Maximize,
  Minimize2,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { CustomerSwitcher } from "./CustomerSwitcher";
import { TapSwitch } from "./TapSwitch";
import { useAuth } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";
import { useAccountActions } from "../hooks/useAccountActions";
import { isGlobalSearchTab, isWildberriesTab, useResetGlobalSearchOnWildberries } from "../wb/appWb";
import { isAndroidPushEnvironment } from "../lib/androidPushNotifications";

type Props = {
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  useServiceRequest: boolean;
  setUseServiceRequest: React.Dispatch<React.SetStateAction<boolean>>;
  serviceModeUnlocked: boolean;
  serviceRefreshSpinning: boolean;
  setServiceRefreshSpinning: React.Dispatch<React.SetStateAction<boolean>>;
  onLogout: () => void;
};

export function AppHeader({
  searchText,
  setSearchText,
  useServiceRequest,
  setUseServiceRequest,
  serviceModeUnlocked,
  serviceRefreshSpinning,
  setServiceRefreshSpinning,
  onLogout,
}: Props) {
  const { accounts, activeAccountId, activeAccount } = useAuth();
  const { activeTab, theme, setTheme, desktopExpanded, setDesktopExpanded, requestProfileView } = useAppShell();
  const { handleSwitchAccount, handleUpdateAccount } = useAccountActions();

  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [debugMenuOpen, setDebugMenuOpen] = useState(false);
  const debugMenuRef = useRef<HTMLDivElement>(null);

  useResetGlobalSearchOnWildberries(activeTab, setIsSearchExpanded, setSearchText);

  useEffect(() => {
    if (!debugMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (debugMenuRef.current && !debugMenuRef.current.contains(e.target as Node)) {
        setDebugMenuOpen(false);
      }
    };
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, [debugMenuOpen]);

  const clearSearch = () => setSearchText("");

  return (
    <header className={`app-header${desktopExpanded ? " app-header-wide" : ""}`}>
      <Flex align="center" justify="space-between" className="header-top-row">
        <Flex align="center" className="header-auth-info" style={{ position: "relative", gap: "0.5rem", flexWrap: "wrap" }}>
          {!isWildberriesTab(activeTab) && !useServiceRequest && activeAccountId && activeAccount && (
            <CustomerSwitcher
              accounts={accounts}
              activeAccountId={activeAccountId}
              onSwitchAccount={handleSwitchAccount}
              onUpdateAccount={handleUpdateAccount}
            />
          )}
          {!isWildberriesTab(activeTab) && (
            <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }}>
              {serviceModeUnlocked && (
                <>
                  <Typography.Label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    Служ.
                  </Typography.Label>
                  <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                    <TapSwitch checked={useServiceRequest} onToggle={() => setUseServiceRequest((v) => !v)} />
                  </span>
                </>
              )}
              <Button
                className="search-toggle-button desktop-expand-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setDesktopExpanded((prev) => !prev);
                }}
                title={desktopExpanded ? "Обычная ширина" : "Расширить окно"}
                aria-label={desktopExpanded ? "Обычная ширина" : "Расширить окно"}
              >
                {desktopExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </Button>
              {serviceModeUnlocked && useServiceRequest && (
                <Button
                  className="search-toggle-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setServiceRefreshSpinning(true);
                    window.setTimeout(() => setServiceRefreshSpinning(false), 1500);
                    window.dispatchEvent(new CustomEvent("haulz-service-refresh"));
                  }}
                  title="Обновить из 1С (период текущей вкладки)"
                  aria-label="Обновить из 1С"
                  disabled={serviceRefreshSpinning}
                >
                  {serviceRefreshSpinning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              )}
            </Flex>
          )}
        </Flex>
        <Flex align="center" className="space-x-3">
          {typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug") && (
            <div ref={debugMenuRef} style={{ position: "relative" }}>
              <Button
                type="button"
                className="search-toggle-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDebugMenuOpen((v) => !v);
                }}
                title="Меню отладки"
                aria-label="Меню отладки"
                aria-expanded={debugMenuOpen}
              >
                <Settings className="w-5 h-5" />
              </Button>
              {debugMenuOpen && (
                <div
                  className="filter-dropdown"
                  role="menu"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "100%",
                    marginTop: "0.25rem",
                    minWidth: "200px",
                    padding: "0.5rem 0",
                    background: "var(--color-bg-elevated, #fff)",
                    border: "1px solid var(--color-border, #e5e7eb)",
                    borderRadius: "0.5rem",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    zIndex: 1000,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                    }}
                    onClick={() => {
                      window.location.reload();
                    }}
                  >
                    Обновить страницу
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                    }}
                    onClick={() => {
                      try {
                        [
                          "haulz.accounts",
                          "haulz.activeAccountId",
                          "haulz.selectedAccountIds",
                          "haulz.auth",
                          "haulz.dateFilterState",
                          "haulz.theme",
                          "haulz.favorites",
                          "haulz.cargo.tableMode",
                          "haulz.docs.tableMode",
                          "haulz.docs.section",
                        ].forEach((k) => window.localStorage.removeItem(k));
                      } catch {
                        /* ignore */
                      }
                      window.location.reload();
                    }}
                  >
                    Очистить данные и обновить
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                    }}
                    onClick={async () => {
                      const info = {
                        url: window.location.href,
                        userAgent: navigator.userAgent,
                        localStorageKeys: Object.keys(window.localStorage).filter((k) => k.startsWith("haulz.")),
                      };
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
                        setDebugMenuOpen(false);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    Копировать инфо для отладки
                  </button>
                </div>
              )}
            </div>
          )}
          {isGlobalSearchTab(activeTab) && (
            <Button
              className="search-toggle-button"
              onClick={() => {
                setIsSearchExpanded(!isSearchExpanded);
                if (isSearchExpanded) {
                  clearSearch();
                }
              }}
              title={isSearchExpanded ? "Закрыть поиск" : "Поиск"}
              aria-label={isSearchExpanded ? "Закрыть поиск" : "Поиск"}
            >
              {isSearchExpanded ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </Button>
          )}
          {isAndroidPushEnvironment() && (
            <Button
              className="search-toggle-button"
              onClick={() => requestProfileView("push")}
              title="История push-уведомлений"
              aria-label="История push-уведомлений"
            >
              <Bell className="w-5 h-5" />
            </Button>
          )}
          <Button
            className="search-toggle-button"
            onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
            title={theme === "light" ? "Включить тёмный режим" : "Включить светлый режим"}
            aria-label={theme === "light" ? "Включить тёмный режим" : "Включить светлый режим"}
          >
            {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </Button>
          <Button className="search-toggle-button" onClick={onLogout} title="Выход" aria-label="Выйти">
            <LogOut className="w-5 h-5" />
          </Button>
        </Flex>
      </Flex>
      {isGlobalSearchTab(activeTab) && (
        <div className={`search-container ${isSearchExpanded ? "expanded" : "collapsed"}`}>
          <Search className="w-5 h-5 text-theme-secondary flex-shrink-0 ml-1" />
          <Input
            type="text"
            placeholder={activeTab === "cargo" ? "Номер, штрихкод, номенклатура…" : "Поиск..."}
            className="search-input"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value.toLowerCase())}
          />
        </div>
      )}
    </header>
  );
}
