import React, { useMemo } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { AppBadge } from "./shared/AppBadge";
import { DateText } from "./ui/DateText";
import { formatCurrency, formatInvoiceNumber, stripOoo } from "../lib/formatUtils";
import {
  computeUnpaidInvoicesByPlan,
  PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS,
  type UnpaidInvoicePlanRow,
} from "../lib/unpaidInvoicesByPlan";
import type { CargoItem } from "../types";

type Props = {
  invoices: Record<string, unknown>[];
  cargoItems: CargoItem[];
  loading?: boolean;
  showSums?: boolean;
  onOpen?: () => void;
};

const MAX_ROWS = 12;

function priorityBadge(row: UnpaidInvoicePlanRow) {
  if (row.priority === "high") {
    return (
      <AppBadge tone="danger" title="Плановая дата прибытия на терминал в ближайшие 7 дней или просрочена">
        Высокий
      </AppBadge>
    );
  }
  if (row.priority === "low") {
    return (
      <AppBadge tone="neutral" title="Плановая дата прибытия на терминал позже 7 дней">
        Низкий
      </AppBadge>
    );
  }
  return (
    <AppBadge tone="neutral" title="Плановая дата прибытия не определена">
      —
    </AppBadge>
  );
}

function daysLabel(days: number | null): string {
  if (days == null) return "—";
  if (days < 0) return `${Math.abs(days)} дн. назад`;
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  return `через ${days} дн.`;
}

export function UnpaidInvoicesPlanMonitor({ invoices, cargoItems, loading, showSums = true, onOpen }: Props) {
  const rows = useMemo(
    () => computeUnpaidInvoicesByPlan(invoices, cargoItems),
    [invoices, cargoItems],
  );

  const highCount = rows.filter((r) => r.priority === "high").length;
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;

  if (!loading && rows.length === 0) return null;

  const body = (
    <>
      <div className="unpaid-plan-monitor__head">
        <Flex align="center" gap="0.4rem" style={{ minWidth: 0 }}>
          <AlertCircle className="w-4 h-4" style={{ color: "var(--color-primary-blue)", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <Typography.Body className="unpaid-plan-monitor__title">Неоплаченные счета и план прибытия</Typography.Body>
            <Typography.Label className="unpaid-plan-monitor__subtitle">
              {loading
                ? "Загрузка…"
                : `${rows.length} к оплате · высокий приоритет: ${highCount} (до ${PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS} дн. до плана)`}
            </Typography.Label>
          </div>
        </Flex>
        {onOpen && !loading && <ChevronRight className="unpaid-plan-monitor__chevron" aria-hidden />}
      </div>

      {loading ? (
        <Flex align="center" gap="0.5rem" className="unpaid-plan-monitor__loading">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-primary-blue)" }} />
          <Typography.Label style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
            Счета…
          </Typography.Label>
        </Flex>
      ) : (
        <div className="unpaid-plan-monitor__table-wrap">
          <table className="unpaid-plan-monitor__table">
            <thead>
              <tr>
                <th>Счёт</th>
                <th>Заказчик</th>
                <th>План прибытия</th>
                <th>Срок</th>
                <th>Приоритет</th>
                {showSums && <th style={{ textAlign: "right" }}>К оплате</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={`${row.invoiceNumber}-${row.cargoNumber ?? ""}`}>
                  <td>{formatInvoiceNumber(row.invoiceNumber)}</td>
                  <td title={row.customer}>{stripOoo(row.customer)}</td>
                  <td>
                    {row.planDateKey ? <DateText value={row.planDateKey} /> : "—"}
                    {row.cargoNumber ? (
                      <span className="unpaid-plan-monitor__cargo" title="Перевозка">
                        {row.cargoNumber}
                      </span>
                    ) : null}
                  </td>
                  <td>{daysLabel(row.daysUntilPlan)}</td>
                  <td>{priorityBadge(row)}</td>
                  {showSums && (
                    <td style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {formatCurrency(row.balance, true)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 && (
            <Typography.Label className="unpaid-plan-monitor__more">
              Ещё {hidden} — откройте раздел «Счета»
            </Typography.Label>
          )}
        </div>
      )}
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        className={`unpaid-plan-monitor cargo-card${highCount > 0 ? " unpaid-plan-monitor--alert" : ""}`}
        onClick={onOpen}
        title="Открыть счета в документах"
      >
        {body}
      </button>
    );
  }

  return (
    <div className={`unpaid-plan-monitor cargo-card${highCount > 0 ? " unpaid-plan-monitor--alert" : ""}`}>{body}</div>
  );
}
