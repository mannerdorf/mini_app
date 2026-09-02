import React, { useMemo, useState } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { AppBadge } from "./shared/AppBadge";
import { ClickableInvoiceNumber, leafRowClickProps } from "./ui/EntityLinks";
import { formatCurrency, formatInvoiceNumber, stripOoo } from "../lib/formatUtils";
import { StatusBadge } from "./shared/StatusBadges";
import {
  computeUnpaidInvoicesByPlan,
  groupUnpaidInvoicesByCustomer,
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

/** Вертикальный скролл списка при большом числе счетов. */
const UNPAID_MONITOR_SCROLL_AFTER_ROWS = 8;

function priorityBadge(row: Pick<UnpaidInvoicePlanRow, "priority" | "planDate">) {
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

function amountClassName(priority: UnpaidInvoicePlanRow["priority"]): string {
  return priority === "high" ? "unpaid-plan-monitor__amount unpaid-plan-monitor__amount--high" : "unpaid-plan-monitor__amount";
}

function UnpaidInvoiceDetailRow({
  row,
  showSums,
  onOpenInvoice,
  compact = false,
}: {
  row: UnpaidInvoicePlanRow;
  showSums: boolean;
  onOpenInvoice?: (invoice: Record<string, unknown>) => void;
  compact?: boolean;
}) {
  const rowOpen = onOpenInvoice
    ? leafRowClickProps(() => onOpenInvoice(row.invoice), "Открыть счёт")
    : null;
  return (
    <div
      className={`unpaid-plan-monitor__detail-row${compact ? " unpaid-plan-monitor__detail-row--compact" : ""}`}
      {...(rowOpen ?? {})}
    >
      {!compact && (
        <div className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--invoice">
          <ClickableInvoiceNumber
            number={row.invoiceNumber}
            invoice={row.invoice}
            onOpen={onOpenInvoice}
          />
        </div>
      )}
      <div className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--status">
        {row.cargoState != null && String(row.cargoState).trim() !== "" ? (
          <StatusBadge status={row.cargoState} />
        ) : (
          "—"
        )}
      </div>
      <div className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--cargo">
        {row.cargoNumber ? formatInvoiceNumber(row.cargoNumber) : "—"}
      </div>
      {showSums && (
        <div className={`unpaid-plan-monitor__cell unpaid-plan-monitor__cell--sum ${amountClassName(row.priority)}`}>
          {formatCurrency(row.balance, true)}
        </div>
      )}
    </div>
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
  const { showCustomerColumn, useServiceRequest } = useAppRuntime();
  const groupedByCustomer = showCustomerColumn && useServiceRequest;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rows = useMemo(
    () => computeUnpaidInvoicesByPlan(invoices, cargoItems),
    [invoices, cargoItems],
  );
  const customerGroups = useMemo(
    () => (groupedByCustomer ? groupUnpaidInvoicesByCustomer(rows) : []),
    [groupedByCustomer, rows],
  );

  const highCount = rows.filter((r) => r.priority === "high").length;
  const totalBalance = rows.reduce((acc, r) => acc + r.balance, 0);
  const listScrollable = (groupedByCustomer ? customerGroups.length : rows.length) > UNPAID_MONITOR_SCROLL_AFTER_ROWS;
  const isEmpty = !loading && rows.length === 0;
  const HeadIcon = isEmpty ? CheckCircle2 : AlertCircle;
  const headIconColor = isEmpty ? "#10b981" : "var(--color-primary-blue)";

  const cardClass = `unpaid-plan-monitor cargo-card${
    highCount > 0 ? " unpaid-plan-monitor--alert" : isEmpty ? " unpaid-plan-monitor--ok" : ""
  }`;

  const toggleExpanded = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

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
                    : `${rows.length} к оплате за 3 мес.${showSums ? ` · всего ${formatCurrency(totalBalance, true)}` : ""} · высокий приоритет: ${highCount} (до ${PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS} дн. до плана)`}
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
              listScrollable
                ? "unpaid-plan-monitor__list-wrap unpaid-plan-monitor__list-wrap--scroll"
                : "unpaid-plan-monitor__list-wrap"
            }
          >
            <div
              className={`unpaid-plan-monitor__list-header${
                groupedByCustomer
                  ? " unpaid-plan-monitor__list-header--customer"
                  : " unpaid-plan-monitor__list-header--invoice"
              }`}
            >
              {groupedByCustomer ? (
                <>
                  <span>Заказчик</span>
                  <span>Приоритет</span>
                  {showSums && <span>К оплате</span>}
                </>
              ) : (
                <>
                  <span>Счёт</span>
                  <span>Приоритет</span>
                  {showSums && <span>К оплате</span>}
                </>
              )}
            </div>

            {groupedByCustomer
              ? customerGroups.map((group) => {
                  const key = group.customer;
                  const isExpanded = expandedKey === key;
                  return (
                    <div key={key} className="unpaid-plan-monitor__group">
                      <button
                        type="button"
                        className="unpaid-plan-monitor__summary-row unpaid-plan-monitor__summary-row--customer"
                        onClick={() => toggleExpanded(key)}
                        aria-expanded={isExpanded}
                        title={isExpanded ? "Свернуть счета" : "Показать счета"}
                      >
                        <span className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--customer" title={group.customer}>
                          {stripOoo(group.customer)}
                        </span>
                        <span className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--priority">
                          {priorityBadge(group)}
                        </span>
                        {showSums && (
                          <span className={`unpaid-plan-monitor__cell unpaid-plan-monitor__cell--sum ${amountClassName(group.priority)}`}>
                            {formatCurrency(group.balance, true)}
                          </span>
                        )}
                        <ChevronDown
                          className={`unpaid-plan-monitor__row-chevron${isExpanded ? " unpaid-plan-monitor__row-chevron--open" : ""}`}
                          aria-hidden
                        />
                      </button>
                      {isExpanded && (
                        <div className="unpaid-plan-monitor__details">
                          <div className="unpaid-plan-monitor__details-header">
                            <span>Счёт</span>
                            <span>Статус перевозки</span>
                            <span>Перевозка</span>
                            {showSums && <span>К оплате</span>}
                          </div>
                          {group.items.map((row) => (
                            <UnpaidInvoiceDetailRow
                              key={`${row.invoiceNumber}-${row.cargoNumber ?? ""}`}
                              row={row}
                              showSums={showSums}
                              onOpenInvoice={onOpenInvoice}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              : rows.map((row) => {
                  const key = `${row.invoiceNumber}-${row.cargoNumber ?? ""}`;
                  const isExpanded = expandedKey === key;
                  return (
                    <div key={key} className="unpaid-plan-monitor__group">
                      <button
                        type="button"
                        className="unpaid-plan-monitor__summary-row unpaid-plan-monitor__summary-row--invoice"
                        onClick={() => toggleExpanded(key)}
                        aria-expanded={isExpanded}
                        title={isExpanded ? "Свернуть" : "Подробнее"}
                      >
                        <span className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--invoice">
                          {formatInvoiceNumber(row.invoiceNumber)}
                        </span>
                        <span className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--priority">
                          {priorityBadge(row)}
                        </span>
                        {showSums && (
                          <span className={`unpaid-plan-monitor__cell unpaid-plan-monitor__cell--sum ${amountClassName(row.priority)}`}>
                            {formatCurrency(row.balance, true)}
                          </span>
                        )}
                        <ChevronDown
                          className={`unpaid-plan-monitor__row-chevron${isExpanded ? " unpaid-plan-monitor__row-chevron--open" : ""}`}
                          aria-hidden
                        />
                      </button>
                      {isExpanded && (
                        <div className="unpaid-plan-monitor__details unpaid-plan-monitor__details--single">
                          <div className="unpaid-plan-monitor__details-header unpaid-plan-monitor__details-header--compact">
                            <span>Статус перевозки</span>
                            <span>Перевозка</span>
                            {showSums && <span>К оплате</span>}
                          </div>
                          <UnpaidInvoiceDetailRow row={row} showSums={showSums} onOpenInvoice={onOpenInvoice} compact />
                        </div>
                      )}
                    </div>
                  );
                })}
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
