import React, { useMemo } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { AppBadge } from "./shared/AppBadge";
import { DateText } from "./ui/DateText";
import { ClickableInvoiceNumber, leafRowClickProps } from "./ui/EntityLinks";
import { formatCurrency, stripOoo } from "../lib/formatUtils";
import { StatusBadge } from "./shared/StatusBadges";
import {
  computeUnpaidInvoicesByPlan,
  PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS,
  type UnpaidInvoicePlanRow,
} from "../lib/unpaidInvoicesByPlan";
import type { CargoItem } from "../types";
import { useAppRuntime } from "../contexts/AppRuntimeContext";

type Props = {
  invoices: Record<string, unknown>[];
  cargoItems: CargoItem[];
  loading?: boolean;
  showSums?: boolean;
  onOpen?: () => void;
  onOpenInvoice?: (invoice: Record<string, unknown>) => void;
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
  return (
    <AppBadge
      tone="neutral"
      title={
        row.planDate
          ? "Плановая дата прибытия на терминал позже 7 дней"
          : "Плановая дата прибытия не определена"
      }
    >
      Низкий
    </AppBadge>
  );
}

export function UnpaidInvoicesPlanMonitor({
  invoices,
  cargoItems,
  loading,
  showSums = true,
  onOpen,
  onOpenInvoice,
}: Props) {
  const { showCustomerColumn } = useAppRuntime();
  const rows = useMemo(
    () => computeUnpaidInvoicesByPlan(invoices, cargoItems),
    [invoices, cargoItems],
  );

  const highCount = rows.filter((r) => r.priority === "high").length;
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;

  if (!loading && rows.length === 0) return null;

  const cardClass = `unpaid-plan-monitor cargo-card${highCount > 0 ? " unpaid-plan-monitor--alert" : ""}`;

  return (
    <div className={cardClass}>
      <button
        type="button"
        className="unpaid-plan-monitor__head-btn"
        onClick={onOpen}
        disabled={!onOpen || loading}
        title={onOpen ? "Открыть раздел «Счета»" : undefined}
      >
        <div className="unpaid-plan-monitor__head">
          <Flex align="center" gap="0.4rem" style={{ minWidth: 0 }}>
            <AlertCircle className="w-4 h-4" style={{ color: "var(--color-primary-blue)", flexShrink: 0 }} />
            <div style={{ minWidth: 0, textAlign: "left" }}>
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
      </button>

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
                {showCustomerColumn && <th className="customer-col">Заказчик</th>}
                <th className="unpaid-plan-monitor__col-status">Статус перевозки</th>
                <th
                  className="unpaid-plan-monitor__col-plan-arrival"
                  title="Плановая дата прибытия на терминал"
                >
                  Плановая дата прибытия на терминал
                </th>
                <th>Приоритет</th>
                {showSums && <th style={{ textAlign: "right" }}>К оплате</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const rowOpen = onOpenInvoice
                  ? leafRowClickProps(() => onOpenInvoice(row.invoice), "Открыть счёт")
                  : null;
                return (
                  <tr key={`${row.invoiceNumber}-${row.cargoNumber ?? ""}`} {...(rowOpen ?? {})}>
                    <td>
                      <ClickableInvoiceNumber
                        number={row.invoiceNumber}
                        invoice={row.invoice}
                        onOpen={onOpenInvoice}
                      />
                    </td>
                    {showCustomerColumn && (
                      <td className="customer-col" title={row.customer}>{stripOoo(row.customer)}</td>
                    )}
                    <td className="unpaid-plan-monitor__col-status">
                      {row.cargoState != null && String(row.cargoState).trim() !== "" ? (
                        <StatusBadge status={row.cargoState} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="unpaid-plan-monitor__col-plan-arrival">
                      {row.planDateKey ? <DateText value={row.planDateKey} /> : "—"}
                    </td>
                    <td>{priorityBadge(row)}</td>
                    {showSums && (
                      <td style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {formatCurrency(row.balance, true)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hidden > 0 && onOpen && (
            <button type="button" className="unpaid-plan-monitor__more" onClick={onOpen}>
              Ещё {hidden} — откройте раздел «Счета»
            </button>
          )}
          {hidden > 0 && !onOpen && (
            <Typography.Label className="unpaid-plan-monitor__more">
              Ещё {hidden}
            </Typography.Label>
          )}
        </div>
      )}
    </div>
  );
}
