import React, { useMemo } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
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
  /** Перевозки для плановой даты — подгружаются отдельно, не блокируют список счетов. */
  cargoLoading?: boolean;
  showSums?: boolean;
  onOpen?: () => void;
  onOpenInvoice?: (invoice: Record<string, unknown>) => void;
};

/** Вертикальный скролл таблицы при большом числе счетов (все строки в DOM, сумма — по полному списку). */
const UNPAID_MONITOR_SCROLL_AFTER_ROWS = 8;

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
  cargoLoading = false,
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
  const totalBalance = rows.reduce((acc, r) => acc + r.balance, 0);
  const tableScrollable = rows.length > UNPAID_MONITOR_SCROLL_AFTER_ROWS;
  const isEmpty = !loading && rows.length === 0;
  const HeadIcon = isEmpty ? CheckCircle2 : AlertCircle;
  const headIconColor = isEmpty ? "#10b981" : "var(--color-primary-blue)";

  const cardClass = `unpaid-plan-monitor cargo-card${
    highCount > 0 ? " unpaid-plan-monitor--alert" : isEmpty ? " unpaid-plan-monitor--ok" : ""
  }`;

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
            <HeadIcon className="w-4 h-4" style={{ color: headIconColor, flexShrink: 0 }} aria-hidden />
            <div style={{ minWidth: 0, textAlign: "left" }}>
              <Typography.Body className="unpaid-plan-monitor__title">Монитор задолженности</Typography.Body>
              <Typography.Label className="unpaid-plan-monitor__subtitle">
                {loading
                  ? "Загрузка счетов…"
                  : cargoLoading
                    ? "Счета загружены, уточняем плановые даты…"
                  : isEmpty
                    ? "Задолженностей нет — все счета оплачены"
                    : `${rows.length} к оплате${showSums ? ` · всего ${formatCurrency(totalBalance, true)}` : ""} · высокий приоритет: ${highCount} (до ${PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS} дн. до плана)`}
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
      ) : isEmpty ? (
        <>
          <Typography.Body className="unpaid-plan-monitor__empty-title">Задолженностей нет</Typography.Body>
          <Typography.Label className="unpaid-plan-monitor__empty-hint">
            Неоплаченных счетов не найдено. При появлении задолженности счета появятся в этом блоке с плановой датой прибытия.
          </Typography.Label>
          {onOpen && (
            <button type="button" className="unpaid-plan-monitor__more" onClick={onOpen}>
              Открыть раздел «Счета»
            </button>
          )}
        </>
      ) : (
        <>
        <div
          className={
            tableScrollable
              ? "unpaid-plan-monitor__table-wrap unpaid-plan-monitor__table-wrap--scroll"
              : "unpaid-plan-monitor__table-wrap"
          }
        >
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
              {rows.map((row) => {
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
        </div>
        {onOpen && (
          <button type="button" className="unpaid-plan-monitor__more" onClick={onOpen}>
            Все счета в разделе «Счета»
          </button>
        )}
        </>
      )}
    </div>
  );
}
