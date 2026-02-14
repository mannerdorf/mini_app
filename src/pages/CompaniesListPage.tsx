import React, { useEffect } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { stripOoo } from "../lib/formatUtils";
import { dedupeCompaniesByName } from "../utils";
import type { Account, CompanyRow } from "../types";

type CompaniesListPageProps = {
  accounts: Account[];
  activeAccountId: string | null;
  onSwitchAccount: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
  onBack: () => void;
  onAddCompany: () => void;
};

export function CompaniesListPage({
  accounts,
  activeAccountId,
  onSwitchAccount,
  onRemoveAccount,
  onUpdateAccount,
  onBack,
  onAddCompany,
}: CompaniesListPageProps) {
  const [companies, setCompanies] = React.useState<CompanyRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const accountsKey = React.useMemo(
    () => accounts.map((a) => `${a.login}:${!!a.accessAllInns}`).join(","),
    [accounts]
  );

  useEffect(() => {
    if (accounts.length === 0) {
      setCompanies([]);
      setLoading(false);
      return;
    }
    const logins = [...new Set(accounts.map((a) => a.login.trim().toLowerCase()))];
    const accessAllLogins = [
      ...new Set(accounts.filter((a) => a.accessAllInns).map((a) => a.login.trim().toLowerCase())),
    ];
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
  }, [accountsKey]);

  const activeAccount = accounts.find((acc) => acc.id === activeAccountId) || null;
  const activeLogin = activeAccount?.login?.trim().toLowerCase() ?? "";
  const activeInn = activeAccount?.activeCustomerInn ?? activeAccount?.customers?.[0]?.inn ?? "";

  const handleSelectCompany = (c: CompanyRow) => {
    const acc = accounts.find((a) => a.login.trim().toLowerCase() === c.login);
    if (!acc) return;
    onSwitchAccount(acc.id);
    if (c.inn !== undefined && c.inn !== null) {
      onUpdateAccount(acc.id, { activeCustomerInn: c.inn });
    }
  };

  const handleRemoveByLogin = (login: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const acc = accounts.find((a) => a.login.trim().toLowerCase() === login);
    if (acc) onRemoveAccount(acc.id);
  };

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>Мои компании</Typography.Headline>
      </Flex>

      {loading ? (
        <Panel className="cargo-card" style={{ padding: "1rem", textAlign: "center" }}>
          <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            Загрузка…
          </Typography.Body>
        </Panel>
      ) : companies.length === 0 ? (
        <Panel className="cargo-card" style={{ padding: "1rem", textAlign: "center" }}>
          <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            Нет добавленных компаний
          </Typography.Body>
        </Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
          {companies.map((c) => {
            const isActive = activeLogin === c.login && (c.inn === "" || c.inn === activeInn);
            return (
              <Panel
                key={`${c.login}-${c.inn}`}
                className="cargo-card"
                style={{
                  padding: "0.75rem 1rem",
                  cursor: "pointer",
                  borderLeft: isActive ? "3px solid var(--color-primary)" : undefined,
                }}
                onClick={() => handleSelectCompany(c)}
              >
                <Flex align="center" justify="space-between">
                  <Typography.Body
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: isActive ? 600 : "normal",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {stripOoo(c.name)}
                  </Typography.Body>
                  <Flex align="center" style={{ gap: "0.5rem", flexShrink: 0 }}>
                    {isActive && <span className="status-value success">Активна</span>}
                    {accounts.length > 1 && (
                      <Button
                        className="filter-button"
                        onClick={(e) => handleRemoveByLogin(c.login, e)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          minWidth: "auto",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="Удалить учётную запись"
                        aria-label="Удалить учётную запись"
                      >
                        <Trash2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                      </Button>
                    )}
                  </Flex>
                </Flex>
              </Panel>
            );
          })}
        </div>
      )}

      <Button
        className="button-primary"
        onClick={onAddCompany}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          fontSize: "0.9rem",
          padding: "0.75rem",
        }}
      >
        <Plus className="w-4 h-4" />
        Добавить компанию
      </Button>
    </div>
  );
}
