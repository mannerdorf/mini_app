import React, { useMemo, useState } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { AppBadge } from "./shared/AppBadge";
import { ClickableInvoiceNumber, ClickableCargoNumber, leafRowClickProps } from "./ui/EntityLinks";
import { formatCurrency, formatInvoiceNumber, stripOoo } from "../lib/formatUtils";
import { StatusBadge } from "./shared/StatusBadges";
import {
  computeUnpaidInvoicesByPlan,
  computeUnbilledCargoByPlan,
  groupUnpaidInvoicesByCustomer,
  groupUnbilledCargoByCustomer,
  mergeUnpaidMonitorCustomerGroups,
  PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS,
  type UnpaidInvoicePlanRow,
  type UnbilledCargoPlanRow,
  type UnpaidMonitorCustomerGroup,
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
  onOpenCargo?: (cargoNumber: string) => void;
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

function UnbilledCargoDetailRow({
  row,
  showSums,
  onOpenCargo,
}: {
  row: UnbilledCargoPlanRow;
  showSums: boolean;
  onOpenCargo?: (cargoNumber: string) => void;
}) {
  const rowOpen = onOpenCargo
    ? leafRowClickProps(() => onOpenCargo(row.cargoNumber), "Открыть перевозку")
    : null;
  return (
    <div className="unpaid-plan-monitor__detail-row unpaid-plan-monitor__detail-row--unbilled" {...(rowOpen ?? {})}>
      <div className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--cargo">
        <ClickableCargoNumber number={row.cargoNumber} onOpen={onOpenCargo} />
      </div>
      <div className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--status">
        {row.cargoState != null && String(row.cargoState).trim() !== "" ? (
          <StatusBadge status={row.cargoState} />
        ) : (
          "—"
        )}
      </div>
      {showSums && (
        <div className={`unpaid-plan-monitor__cell unpaid-plan-monitor__cell--sum ${amountClassName(row.priority)}`}>
          {formatCurrency(row.sum, true)}
        </div>
      )}
    </div>
  );
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
  onOpenCargo,
}: Props) {
  const { showCustomerColumn, useServiceRequest } = useAppRuntime();
  const groupedByCustomer = showCustomerColumn && useServiceRequest;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rows = useMemo(
    () => computeUnpaidInvoicesByPlan(invoices, cargoItems),
    [invoices, cargoItems],
  );
  const unbilledRows = useMemo(
    () => (groupedByCustomer ? computeUnbilledCargoByPlan(cargoItems) : []),
    [groupedByCustomer, cargoItems],
  );
  const customerGroups = useMemo(
    () => (groupedByCustomer ? groupUnpaidInvoicesByCustomer(rows) : []),
    [groupedByCustomer, rows],
  );
  const mergedCustomerGroups = useMemo((): UnpaidMonitorCustomerGroup[] => {
    if (!groupedByCustomer) return [];
    return mergeUnpaidMonitorCustomerGroups(
      customerGroups,
      groupUnbilledCargoByCustomer(unbilledRows),
    );
  }, [groupedByCustomer, customerGroups, unbilledRows]);

  const highCount = rows.filter((r) => r.priority === "high").length;
  const totalBalance = rows.reduce((acc, r) => acc + r.balance, 0);
  const unbilledCount = unbilledRows.length;
  const unbilledSum = unbilledRows.reduce((acc, r) => acc + r.sum, 0);
  const listScrollable = (groupedByCustomer ? mergedCustomerGroups.length : rows.length) > UNPAID_MONITOR_SCROLL_AFTER_ROWS;
  const isEmpty = !loading && rows.length === 0 && unbilledCount === 0;
  const HeadIcon = isEmpty ? CheckCircle2 : AlertCircle;
  const headIconColor = isEmpty ? "#10b981" : "var(--color-primary-blue)";

  const subtitleText = useMemo(() => {
    if (loading) return "Загрузка счетов…";
    if (cargoLoading) return "Счета загружены, уточняем плановые даты…";
    if (isEmpty) return "Задолженностей нет — все счета оплачены";
    const parts: string[] = [];
    if (rows.length > 0) {
      parts.push(
        `${rows.length} к оплате за 3 мес.${showSums ? ` · всего ${formatCurrency(totalBalance, true)}` : ""}`,
      );
      parts.push(`высокий приоритет: ${highCount} (до ${PLAN_ARRIVAL_HIGH_PRIORITY_WITHIN_DAYS} дн. до плана)`);
    }
    if (groupedByCustomer && unbilledCount > 0) {
      parts.push(`невыст.: ${unbilledCount} перев.${showSums ? ` · ${formatCurrency(unbilledSum, true)}` : ""}`);
    }
    return parts.join(" · ");
  }, [
    loading,
    cargoLoading,
    isEmpty,
    rows.length,
    showSums,
    totalBalance,
    highCount,
    groupedByCustomer,
    unbilledCount,
    unbilledSum,
  ]);

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
                {subtitleText}
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
                  ? " unpaid-plan-monitor__list-header--customer-unbilled"
                  : " unpaid-plan-monitor__list-header--invoice"
              }`}
            >
              {groupedByCustomer ? (
                <>
                  <span>Заказчик</span>
                  <span>Приоритет</span>
                  <span>Невыст.</span>
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
              ? mergedCustomerGroups.map((group) => {
                  const key = group.customer;
                  const isExpanded = expandedKey === key;
                  return (
                    <div key={key} className="unpaid-plan-monitor__group">
                      <button
                        type="button"
                        className="unpaid-plan-monitor__summary-row unpaid-plan-monitor__summary-row--customer-unbilled"
                        onClick={() => toggleExpanded(key)}
                        aria-expanded={isExpanded}
                        title={isExpanded ? "Свернуть" : "Подробнее"}
                      >
                        <span className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--customer" title={group.customer}>
                          {stripOoo(group.customer)}
                        </span>
                        <span className="unpaid-plan-monitor__cell unpaid-plan-monitor__cell--priority">
                          {priorityBadge(group)}
                        </span>
                        <span
                          className={`unpaid-plan-monitor__cell unpaid-plan-monitor__cell--unbilled${
                            group.unbilledCount > 0 ? " unpaid-plan-monitor__cell--unbilled--has" : ""
                          }`}
                          title={
                            group.unbilledCount > 0
                              ? `${group.unbilledCount} перевозок без счёта`
                              : "Невыставленных перевозок нет"
                          }
                        >
                          {group.unbilledCount > 0
                            ? showSums
                              ? `${group.unbilledCount} · ${formatCurrency(group.unbilledSum, true)}`
                              : String(group.unbilledCount)
                            : "—"}
                        </span>
                        {showSums && (
                          <span className={`unpaid-plan-monitor__cell unpaid-plan-monitor__cell--sum ${amountClassName(group.priority)}`}>
                            {group.balance > 0 ? formatCurrency(group.balance, true) : "—"}
                          </span>
                        )}
                        <ChevronDown
                          className={`unpaid-plan-monitor__row-chevron${isExpanded ? " unpaid-plan-monitor__row-chevron--open" : ""}`}
                          aria-hidden
                        />
                      </button>
                      {isExpanded && (
                        <div className="unpaid-plan-monitor__details">
                          {group.items.length > 0 && (
                            <>
                              <div className="unpaid-plan-monitor__details-section-title">Неоплаченные счета</div>
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
                            </>
                          )}
                          {group.unbilledItems.length > 0 && (
                            <>
                              <div className="unpaid-plan-monitor__details-section-title">Невыставленные перевозки</div>
                              <div className="unpaid-plan-monitor__details-header unpaid-plan-monitor__details-header--unbilled">
                                <span>Перевозка</span>
                                <span>Статус</span>
                                {showSums && <span>Стоимость</span>}
                              </div>
                              {group.unbilledItems.map((row) => (
                                <UnbilledCargoDetailRow
                                  key={row.cargoNumber}
                                  row={row}
                                  showSums={showSums}
                                  onOpenCargo={onOpenCargo}
                                />
                              ))}
                            </>
                          )}
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
