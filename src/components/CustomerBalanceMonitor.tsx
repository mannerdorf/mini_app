import React, { useMemo } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronRight, Loader2, Wallet } from "lucide-react";
import { formatCurrency, stripOoo } from "../lib/formatUtils";
import type { CustomerBalanceRow } from "../api/client/customerBalanceClient";

type Props = {
  balances: CustomerBalanceRow[];
  totalBalance: number;
  loading?: boolean;
  error?: string | null;
  showCustomerColumn?: boolean;
  activeInn?: string;
};

export function CustomerBalanceMonitor({
  balances,
  totalBalance,
  loading,
  error,
  showCustomerColumn,
  activeInn,
}: Props) {
  const sorted = useMemo(
    () => [...balances].sort((a, b) => b.balance - a.balance),
    [balances],
  );

  const hasDebt = totalBalance > 0;
  const isEmpty = !loading && !error && sorted.length === 0;
  const showTable = sorted.length > 1 || (showCustomerColumn && sorted.length > 0);

  if (!loading && isEmpty && !error) return null;

  const cardClass = `customer-balance-monitor cargo-card${
    hasDebt ? " customer-balance-monitor--alert" : " customer-balance-monitor--ok"
  }`;

  return (
    <div className={cardClass}>
      <Flex align="center" justify="space-between" gap="0.5rem" className="customer-balance-monitor__head">
        <Flex align="center" gap="0.5rem" style={{ minWidth: 0 }}>
          <Wallet className="w-4 h-4" style={{ color: hasDebt ? "#dc2626" : "#10b981", flexShrink: 0 }} aria-hidden />
          <div style={{ minWidth: 0 }}>
            <Typography.Body style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Баланс по субконто (1С)
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
              Σ ДТ − Σ Кт по GetCustomer
            </Typography.Body>
          </div>
        </Flex>
        {!loading && !error && (
          <Typography.Body
            style={{
              fontWeight: 700,
              fontSize: "1rem",
              color: hasDebt ? "#dc2626" : "var(--color-text-primary)",
              whiteSpace: "nowrap",
            }}
          >
            {formatCurrency(totalBalance, true)}
          </Typography.Body>
        )}
        {loading && <Loader2 className="w-4 h-4 animate-spin" aria-label="Загрузка" />}
      </Flex>

      {error && (
        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
          {error}
        </Typography.Body>
      )}

      {showTable && !error && (
        <div className={`customer-balance-monitor__table-wrap${sorted.length > 6 ? " customer-balance-monitor__table-wrap--scroll" : ""}`}>
          <table className="customer-balance-monitor__table">
            <thead>
              <tr>
                <th>Компания</th>
                <th style={{ textAlign: "right" }}>Баланс</th>
                <th style={{ textAlign: "right" }}>Строк</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const isActive = activeInn && row.inn === activeInn;
                const rowHasDebt = row.balance > 0;
                return (
                  <tr key={row.inn} className={isActive ? "customer-balance-monitor__row--active" : undefined}>
                    <td>
                      <Typography.Body style={{ fontWeight: isActive ? 700 : 500, fontSize: "0.85rem" }}>
                        {stripOoo(row.name)}
                      </Typography.Body>
                      {row.error && (
                        <Typography.Body style={{ fontSize: "0.7rem", color: "#dc2626" }}>{row.error}</Typography.Body>
                      )}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 600, color: rowHasDebt ? "#dc2626" : "var(--color-text-primary)" }}>
                        {formatCurrency(row.balance, true)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: "var(--color-text-secondary)", fontSize: "0.8rem" }}>
                      {row.debtsCount || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!showTable && sorted.length === 1 && !error && !loading && (
        <Flex align="center" justify="space-between" style={{ marginTop: "0.35rem" }}>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            {sorted[0].debtsCount > 0 ? `${sorted[0].debtsCount} строк субконто` : "Нет открытых строк"}
          </Typography.Body>
          <ChevronRight className="w-4 h-4" style={{ color: "var(--color-text-secondary)", opacity: 0.5 }} aria-hidden />
        </Flex>
      )}
    </div>
  );
}
