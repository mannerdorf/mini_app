import React, { useState, useEffect } from "react";
import { Button, Input, Typography } from "@maxhub/max-ui";
import { ChevronDown, Check } from "lucide-react";
import type { Account } from "../types";
import type { HeaderCompanyRow } from "../types";
import { stripOoo } from "../lib/formatUtils";
import { dedupeCompaniesByName } from "../utils";

type CustomerSwitcherProps = {
  accounts: Account[];
  activeAccountId: string | null;
  onSwitchAccount: (accountId: string) => void;
  onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
};

export function CustomerSwitcher({ accounts, activeAccountId, onSwitchAccount, onUpdateAccount }: CustomerSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [companies, setCompanies] = useState<HeaderCompanyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const activeAccount = accounts.find((acc) => acc.id === activeAccountId) || null;
  const activeLogin = activeAccount?.login?.trim().toLowerCase() ?? "";
  const activeInn = activeAccount?.activeCustomerInn ?? activeAccount?.customers?.[0]?.inn ?? "";

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".customer-switcher")) setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || accounts.length === 0) return;
    const logins = [...new Set(accounts.map((a) => a.login.trim().toLowerCase()))];
    const accessAllLogins = [...new Set(accounts.filter((a) => a.accessAllInns).map((a) => a.login.trim().toLowerCase()))];
    const query =
      logins.map((l) => `login=${encodeURIComponent(l)}`).join("&") +
      (accessAllLogins.length ? "&" + accessAllLogins.map((l) => `access_all=${encodeURIComponent(l)}`).join("&") : "");
    setLoading(true);
    fetch(`/api/companies?${query}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.companies) ? data.companies : [];
        setCompanies(dedupeCompaniesByName(list));
      })
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  }, [isOpen, accounts.map((a) => `${a.login}:${!!a.accessAllInns}`).join(",")]);

  const activeCompany = companies.find((c) => c.login === activeLogin && (c.inn === "" || c.inn === activeInn));
  const displayName = activeCompany ? stripOoo(activeCompany.name) : stripOoo(activeAccount?.customer || activeAccount?.customers?.[0]?.name || "Компания");

  const handleSelect = (c: HeaderCompanyRow) => {
    const acc = accounts.find((a) => a.login.trim().toLowerCase() === c.login);
    if (!acc) return;
    onSwitchAccount(acc.id);
    if (c.inn !== undefined && c.inn !== null) {
      onUpdateAccount(acc.id, { activeCustomerInn: c.inn });
    }
    setIsOpen(false);
    setSearchQuery("");
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredCompanies = searchLower
    ? companies.filter((c) => stripOoo(c.name).toLowerCase().includes(searchLower) || (c.login || "").toLowerCase().includes(searchLower))
    : companies;

  if (!activeAccountId || !activeAccount) return null;

  return (
    <div className="customer-switcher filter-group" style={{ position: "relative", display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <Button
        type="button"
        className="filter-button"
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}
        title="Выбрать компанию"
        aria-label={`Компания: ${displayName}. Открыть список`}
        aria-expanded={isOpen}
      >
        <Typography.Body style={{ fontSize: "0.9rem" }}>{displayName}</Typography.Body>
        <ChevronDown className="w-4 h-4" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} aria-hidden />
      </Button>
      {isOpen && (
        <div
          className="filter-dropdown"
          style={{ minWidth: "220px", maxHeight: "min(60vh, 320px)", overflowY: "auto" }}
          role="listbox"
          aria-label="Список компаний"
        >
          {loading ? (
            <div style={{ padding: "0.75rem 1rem" }}>
              <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Загрузка…</Typography.Body>
            </div>
          ) : companies.length === 0 ? (
            <div style={{ padding: "0.75rem 1rem" }}>
              <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Нет компаний</Typography.Body>
            </div>
          ) : (
            <>
              <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--color-border)" }} onClick={(e) => e.stopPropagation()}>
                <Input
                  type="text"
                  placeholder="Поиск по названию…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="filter-dropdown-search-input"
                  style={{ fontSize: "0.9rem", padding: "0.4rem 0.5rem" }}
                  aria-label="Поиск по названию компании"
                />
              </div>
              {filteredCompanies.length === 0 ? (
                <div style={{ padding: "0.75rem 1rem" }}>
                  <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Ничего не найдено</Typography.Body>
                </div>
              ) : (
                filteredCompanies.map((c) => {
                  const isActive = activeLogin === c.login && (c.inn === "" || c.inn === activeInn);
                  return (
                    <div
                      key={`${c.login}-${c.inn}`}
                      role="option"
                      aria-selected={isActive}
                      className={`dropdown-item ${isActive ? "active" : ""}`}
                      onClick={() => handleSelect(c)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: isActive ? "var(--color-bg-hover)" : "transparent",
                      }}
                    >
                      <Typography.Body style={{ fontSize: "0.9rem", fontWeight: isActive ? "bold" : "normal" }}>{stripOoo(c.name)}</Typography.Body>
                      {isActive && <Check className="w-4 h-4" style={{ color: "var(--color-primary)" }} aria-hidden />}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
