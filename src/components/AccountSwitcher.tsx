import React, { useState, useEffect } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, Check, User as UserIcon, Building2 } from "lucide-react";
import type { Account } from "../types";
import { stripOoo } from "../lib/formatUtils";

type AccountSwitcherProps = {
  accounts: Account[];
  activeAccountId: string | null;
  onSwitchAccount: (accountId: string) => void;
};

export function AccountSwitcher({ accounts, activeAccountId, onSwitchAccount }: AccountSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeAccount = accounts.find((acc) => acc.id === activeAccountId);
  const activeLabel = stripOoo(activeAccount?.customer || activeAccount?.login || "") || "Не выбран";

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".account-switcher")) setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="account-switcher filter-group" style={{ position: "relative" }}>
      <Button
        type="button"
        className="filter-button"
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}
        title={`Переключить аккаунт (${accounts.length} аккаунтов)`}
        aria-label={`Аккаунт: ${activeLabel}. Открыть список`}
        aria-expanded={isOpen}
      >
        <UserIcon className="w-4 h-4" aria-hidden />
        <Typography.Body style={{ fontSize: "0.9rem" }}>{activeLabel}</Typography.Body>
        <ChevronDown className="w-4 h-4" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} aria-hidden />
      </Button>
      {isOpen && (
        <div className="filter-dropdown" style={{ minWidth: "200px" }} role="listbox" aria-label="Список аккаунтов">
          {accounts.map((account) => (
            <div
              key={account.id}
              role="option"
              aria-selected={activeAccountId === account.id}
              className={`dropdown-item ${activeAccountId === account.id ? "active" : ""}`}
              onClick={() => {
                onSwitchAccount(account.id);
                setIsOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: activeAccountId === account.id ? "var(--color-bg-hover)" : "transparent",
              }}
            >
              <Flex align="center" style={{ flex: 1, gap: "0.5rem" }}>
                <Building2 className="w-4 h-4" style={{ color: "var(--color-primary)" }} aria-hidden />
                <Typography.Body style={{ fontSize: "0.9rem", fontWeight: activeAccountId === account.id ? "bold" : "normal" }}>
                  {stripOoo(account.customer || account.login)}
                </Typography.Body>
              </Flex>
              {activeAccountId === account.id && <Check className="w-4 h-4" style={{ color: "var(--color-primary)" }} aria-hidden />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
