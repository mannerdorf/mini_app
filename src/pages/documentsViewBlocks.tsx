import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Copy, Heart, Loader2, AlertTriangle, Share2, Ship, Truck } from "lucide-react";
import { invoiceDocSum } from "../../lib/invoiceAmounts.js";
import { cityToCode, formatCurrency, formatInvoiceNumber, normalizeInvoiceStatus, stripOoo } from "../lib/formatUtils";
import { ClickableCargoNumber, ClickableInvoiceNumber } from "../components/ui/EntityLinks";
import { getPayTillDate, getPayTillDateColor } from "../lib/dateUtils";
import {
  aggregateInvoiceEdoDocStats,
  edoCardBadgeSurfaceStyle,
  edoTableCellTextStyle,
  formatEdoSignedRatio,
  getEdoCardCompactLabel,
  getEdoCardDisplayLabel,
  getEdoTableDisplayLabel,
  getInvoiceEdoInfoByDocLabel,
  INVOICE_EDO_MERGED_COLUMNS,
  type EdoStatusInfo,
  type InvoiceEdoDocAgg,
  type InvoiceEdoMergedDocLabel,
} from "../lib/edoStatus";
import { DateText } from "../components/ui/DateText";
import { AppBadge } from "../components/shared/AppBadge";
import { RouteBadge, CargoTransportTypeIcon, formatRouteLabel } from "../components/shared/CargoTableDisplay";
import { StatusBadge } from "../components/shared/StatusBadges";
import { getSumColorByPaymentStatus } from "../lib/statusUtils";
import { cargoExpandMotionProps, cargoListContainerVariants, cargoTableGroupRowVariants, documentsListItemVariants } from "./cargoMotion";
import { findInvoiceLinkedToAct, getItemInn, type DocsSummaryTotals, type EdoCargoCardItem } from "./documentsPipeline";
import { innIsEdoPartner } from "../lib/edoCounterpartyStatus";

export function DocumentsEdoTableStatus({ info }: { info: EdoStatusInfo }) {
  return (
    <span style={edoTableCellTextStyle(info.tone)} title={info.label}>
      {getEdoTableDisplayLabel(info)}
    </span>
  );
}

export function DocumentsEdoCardBadge({
  info,
  docLabel,
  compact = false,
}: {
  info: EdoStatusInfo;
  docLabel?: InvoiceEdoMergedDocLabel;
  compact?: boolean;
}) {
  const label = compact && docLabel ? getEdoCardCompactLabel(docLabel, info) : getEdoCardDisplayLabel(info);
  const title = docLabel ? `${docLabel === "СЧЕТ" ? "Счета" : docLabel}: ${info.label}` : info.label;
  return (
    <span
      className={`documents-edo-card-badge${compact ? " documents-edo-card-badge--compact" : ""}`}
      style={edoCardBadgeSurfaceStyle(info.tone)}
      title={title}
    >
      {label}
    </span>
  );
}

/** Контрагент из GETALLKontragents со статусом IsMyCounteragent — работаем по ЭДО. */
export function DocumentsEdoPartnerBadge() {
  return (
    <AppBadge tone="success" title="Работаем с контрагентом по ЭДО">
      ЭДО
    </AppBadge>
  );
}

function rowHasEdoPartner(items: any[], edoPartnerInns?: ReadonlySet<string>): boolean {
  if (!edoPartnerInns?.size) return false;
  for (const inv of items) {
    if (innIsEdoPartner(edoPartnerInns, getItemInn(inv))) return true;
  }
  return false;
}

export type EdoMonitorCustomerRow = { customer: string; items: any[]; sum: number };

function pickRowInn(items: any[]): string {
  for (const item of items) {
    const inn = getItemInn(item);
    if (inn) return inn;
  }
  return "";
}

function DocumentsInnCopyCell({ inn }: { inn: string }) {
  const [copied, setCopied] = useState(false);
  const display = inn || "—";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inn) return;
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(inn).then(done).catch(() => {});
      return;
    }
    done();
  };

  return (
    <Flex align="center" gap="0.2rem" className="documents-edo-inn-cell" style={{ minWidth: 0 }}>
      <span
        className="documents-edo-inn-cell__value"
        style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={inn || undefined}
      >
        {display}
      </span>
      {inn ? (
        <button
          type="button"
          className={`documents-edo-inn-cell__copy${copied ? " documents-edo-inn-cell__copy--copied" : ""}`}
          onClick={handleCopy}
          title={copied ? "Скопировано" : "Скопировать ИНН"}
          aria-label={copied ? "ИНН скопирован" : "Скопировать ИНН"}
        >
          {copied ? (
            <Check strokeWidth={2} aria-hidden />
          ) : (
            <Copy strokeWidth={2} aria-hidden />
          )}
        </button>
      ) : null}
    </Flex>
  );
}

type EdoMonitorTableProps = {
  rows: EdoMonitorCustomerRow[];
  totals: Record<InvoiceEdoMergedDocLabel, InvoiceEdoDocAgg>;
  invoicesCount: number;
  expandedCustomer: string | null;
  onToggleCustomer: (customer: string) => void;
  onOpenInvoice: (inv: any) => void;
  sortColumn: "customer" | "sum" | "count";
  sortOrder: "asc" | "desc";
  onSort: (column: "customer" | "sum" | "count") => void;
  docsMotionEnabled?: boolean;
  /** Одна компания: сразу таблица счетов без группировки по заказчику. */
  flatDirectItems?: any[];
  showCustomerColumn?: boolean;
  edoPartnerInns?: ReadonlySet<string>;
};

function renderEdoInvoiceInnerRows(items: any[], onOpenInvoice: (inv: any) => void) {
  return items.map((inv: any, j: number) => {
    const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? "";
    const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? "";
    return (
      <tr
        key={String(inum) || j}
        style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
        onClick={() => onOpenInvoice(inv)}
        title="Открыть счёт"
      >
        <td style={{ padding: "0.35rem 0.3rem" }}>
          <ClickableInvoiceNumber number={String(inum)} invoice={inv} onOpen={onOpenInvoice} />
        </td>
        <td className="doc-inner-table-date" style={{ padding: "0.35rem 0.3rem" }}>
          <DateText value={typeof idt === "string" ? idt : idt ? String(idt) : undefined} />
        </td>
        {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
          <td key={k} style={{ padding: "0.35rem 0.3rem" }}>
            <DocumentsEdoTableStatus info={getInvoiceEdoInfoByDocLabel(inv, k)} />
          </td>
        ))}
      </tr>
    );
  });
}

const DOCS_SUMMARY_COLLAPSED_KEY = "haulz.documents.summaryCollapsedMobile";

const financeThStyle = (withSort: boolean): React.CSSProperties => ({
  textAlign: "right",
  fontWeight: 600,
  cursor: withSort ? "pointer" : undefined,
  userSelect: withSort ? "none" : undefined,
});

function financeSortIcon(active: boolean, order: "asc" | "desc") {
  if (!active) return null;
  return order === "asc" ? (
    <ArrowUp className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />
  ) : (
    <ArrowDown className="w-3 h-3 cargo-inner-table__sort-icon" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />
  );
}

/** Заголовки Сумма / Оплачено / Остаток: на мобиле — три строки в одной колонке. */
export function DocumentsInvoiceFinanceHeadCells({
  padding = "0.35rem 0.3rem",
  withSort = false,
  sortColumn,
  sortOrder = "asc",
  onSort,
}: {
  padding?: string;
  withSort?: boolean;
  sortColumn?: "sum" | "paid" | "balance";
  sortOrder?: "asc" | "desc";
  onSort?: (column: "sum" | "paid" | "balance") => void;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <th
        className="cargo-inner-table__col-sum"
        style={{ ...financeThStyle(withSort), padding }}
        onClick={withSort && onSort ? (e) => { stop(e); onSort("sum"); } : undefined}
        title={withSort ? "Сортировка" : undefined}
      >
        <span className="cargo-inner-table__head-long">Сумма</span>
        <span className="cargo-inner-table__head-finance-stack" aria-hidden>
          <span>Сум.</span>
          <span>Опл.</span>
          <span>Ост.</span>
        </span>
        {financeSortIcon(sortColumn === "sum", sortOrder)}
      </th>
      <th
        className="cargo-inner-table__col-paid cargo-inner-table__col-finance-desktop-only"
        style={{ ...financeThStyle(withSort), padding }}
        onClick={withSort && onSort ? (e) => { stop(e); onSort("paid"); } : undefined}
        title={withSort ? "Сортировка" : undefined}
      >
        <span className="cargo-inner-table__head-long">Оплачено</span>
        <span className="cargo-inner-table__head-short">Опл.</span>
        {financeSortIcon(sortColumn === "paid", sortOrder)}
      </th>
      <th
        className="cargo-inner-table__col-balance cargo-inner-table__col-finance-desktop-only"
        style={{ ...financeThStyle(withSort), padding }}
        onClick={withSort && onSort ? (e) => { stop(e); onSort("balance"); } : undefined}
        title={withSort ? "Сортировка" : undefined}
      >
        <span className="cargo-inner-table__head-long">Остаток</span>
        <span className="cargo-inner-table__head-short">Ост.</span>
        {financeSortIcon(sortColumn === "balance", sortOrder)}
      </th>
    </>
  );
}

/** Ячейки Сумма / Оплачено / Остаток: на мобиле — три строки в одной колонке. */
export function DocumentsInvoiceFinanceCells({
  sum,
  paid,
  balance,
  payState,
  padding = "0.35rem 0.3rem",
}: {
  sum: number;
  paid: number;
  balance: number;
  payState: string;
  padding?: string;
}) {
  const cellStyle: React.CSSProperties = { padding, textAlign: "right", verticalAlign: "middle" };
  const balanceColor = getSumColorByPaymentStatus(payState);
  return (
    <>
      <td className="cargo-inner-table__col-sum documents-invoices-inner-table__sum" style={cellStyle}>
        <span className="documents-invoices-inner-table__sum-value documents-invoices-inner-table__sum-primary">
          {formatCurrency(sum)}
        </span>
        <div className="documents-invoices-inner-table__finance-stack">
          <span className="documents-invoices-inner-table__sum-value documents-invoices-inner-table__sum-value--secondary">
            {formatCurrency(paid)}
          </span>
          <span className="documents-invoices-inner-table__sum-value" style={{ color: balanceColor }}>
            {formatCurrency(balance)}
          </span>
        </div>
      </td>
      <td className="cargo-inner-table__col-paid documents-invoices-inner-table__sum cargo-inner-table__col-finance-desktop-only" style={cellStyle}>
        <span className="documents-invoices-inner-table__sum-value">{formatCurrency(paid)}</span>
      </td>
      <td className="cargo-inner-table__col-balance documents-invoices-inner-table__sum cargo-inner-table__col-finance-desktop-only" style={cellStyle}>
        <span className="documents-invoices-inner-table__sum-value" style={{ color: balanceColor }}>
          {formatCurrency(balance)}
        </span>
      </td>
    </>
  );
}

export function DocumentsEdoMonitorSummaryTiles({
  totals,
  invoicesCount,
  saasAnalytics = false,
  className = "",
}: {
  totals: Record<InvoiceEdoMergedDocLabel, InvoiceEdoDocAgg>;
  invoicesCount: number;
  saasAnalytics?: boolean;
  className?: string;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DOCS_SUMMARY_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    try {
      localStorage.setItem(DOCS_SUMMARY_COLLAPSED_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed, isMobile]);

  const labelStyle = (): React.CSSProperties =>
    saasAnalytics
      ? {
          fontSize: "0.68rem",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          letterSpacing: "0.04em",
          opacity: 0.92,
        }
      : { fontSize: "0.75rem", color: "var(--color-text-secondary)" };
  const valueStyle = (): React.CSSProperties =>
    saasAnalytics
      ? {
          fontWeight: 700,
          fontSize: "1.06rem",
          letterSpacing: "-0.02em",
          color: "var(--color-text-primary)",
        }
      : { fontWeight: 600, fontSize: "0.9rem" };

  const showMetrics = !isMobile || !collapsed;

  return (
    <div
      className={`cargo-card documents-summary-card cargo-summary-totals mb-4 documents-edo-summary-tiles${saasAnalytics ? " documents-summary-totals--saas-kpi cargo-summary-totals--saas-kpi" : ""}${isMobile && collapsed ? " cargo-summary-totals--collapsed" : ""}${className ? ` ${className}` : ""}`}
      style={{
        padding: isMobile && collapsed ? "0.45rem 0.55rem" : saasAnalytics ? undefined : "0.95rem 0.85rem 0.85rem",
        marginBottom: isMobile && collapsed ? "0.45rem" : saasAnalytics ? undefined : "1rem",
      }}
    >
      {isMobile && (
        <button
          type="button"
          className="cargo-summary-totals-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Развернуть итоги ЭДО" : "Свернуть итоги ЭДО"}
        >
          <Typography.Body style={{ fontSize: "0.78rem", fontWeight: 600 }}>Итого по ЭДО</Typography.Body>
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      )}
      {showMetrics && (
        <div className="summary-metrics">
          <Flex direction="column" align="center">
            <Typography.Label style={labelStyle()}>Счетов</Typography.Label>
            <Typography.Body style={valueStyle()}>{invoicesCount}</Typography.Body>
          </Flex>
          {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
            <Flex key={k} direction="column" align="center">
              <Typography.Label style={labelStyle()}>{k === "СЧЕТ" ? "СЧЕТА" : k}</Typography.Label>
              <Typography.Body style={valueStyle()} title="Подписано / всего по ЭДО">
                {formatEdoSignedRatio(totals[k].signed, totals[k].total)}
              </Typography.Body>
            </Flex>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentsEdoMonitorGroupedTable({
  rows,
  totals,
  invoicesCount,
  expandedCustomer,
  onToggleCustomer,
  onOpenInvoice,
  sortColumn,
  sortOrder,
  onSort,
  docsMotionEnabled = false,
  flatDirectItems,
  showCustomerColumn = true,
  edoPartnerInns,
}: EdoMonitorTableProps) {
  const edoColCount = INVOICE_EDO_MERGED_COLUMNS.length;
  const baseColCount = (showCustomerColumn ? 3 : 1) + edoColCount;

  if (flatDirectItems && flatDirectItems.length > 0) {
    return (
      <div className="cargo-card cargo-customer-table-wrap documents-edo-monitor-table" style={{ marginBottom: "1rem" }}>
        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.55rem" }}>
          Монитор ЭДО по счетам: подписано / всего с непустым статусом по типу документа.
        </Typography.Body>
        <div style={{ overflowX: "auto" }}>
          <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                <th style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
                  <th key={k} style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600 }}>
                    {k === "СЧЕТ" ? "Счёт" : k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{renderEdoInvoiceInnerRows(flatDirectItems, onOpenInvoice)}</tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="cargo-card cargo-customer-table-wrap documents-edo-monitor-table" style={{ marginBottom: "1rem" }}>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.55rem" }}>
        Монитор ЭДО по счетам: подписано / всего с непустым статусом по типу документа.
      </Typography.Body>
      <table className="documents-edo-monitor-table__grid" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
            {showCustomerColumn ? (
              <th
                className="customer-col"
                style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
                onClick={() => onSort("customer")}
                title="Сортировка"
              >
                Заказчик{" "}
                {sortColumn === "customer" &&
                  (sortOrder === "asc" ? (
                    <ArrowUp className="w-3 h-3" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />
                  ) : (
                    <ArrowDown className="w-3 h-3" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />
                  ))}
              </th>
            ) : null}
            {showCustomerColumn ? (
              <th
                className="documents-edo-inn-col"
                style={{ padding: "0.5rem 0.4rem", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}
              >
                ИНН
              </th>
            ) : null}
            <th
              style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 600, cursor: "pointer", userSelect: "none" }}
              onClick={() => onSort("count")}
              title="Сортировка"
            >
              Счетов{" "}
              {sortColumn === "count" &&
                (sortOrder === "asc" ? (
                  <ArrowUp className="w-3 h-3" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />
                ) : (
                  <ArrowDown className="w-3 h-3" style={{ verticalAlign: "middle", marginLeft: 2, display: "inline-block" }} />
                ))}
            </th>
            {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
              <th
                key={k}
                style={{ padding: "0.5rem 0.35rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}
                title="ЭДО: подписано / всего (счета с непустым статусом по этому документу)"
              >
                {k === "СЧЕТ" ? "СЧЕТА" : k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowEdoAgg = aggregateInvoiceEdoDocStats(row.items);
            const isExpanded = expandedCustomer === row.customer;
            return (
              <React.Fragment key={`${row.customer}-${i}`}>
                <motion.tr
                  custom={i}
                  variants={docsMotionEnabled ? cargoTableGroupRowVariants : undefined}
                  initial={docsMotionEnabled ? "initial" : false}
                  animate={docsMotionEnabled ? "animate" : undefined}
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    cursor: "pointer",
                    background: isExpanded ? "var(--color-bg-hover)" : undefined,
                  }}
                  onClick={() => onToggleCustomer(row.customer)}
                  title={isExpanded ? "Свернуть" : "Показать счета"}
                >
                  {showCustomerColumn ? (
                    <td
                      className="customer-col"
                      style={{ padding: "0.5rem 0.4rem", maxWidth: 260 }}
                      title={stripOoo(row.customer)}
                    >
                      <Flex align="center" gap="0.35rem" wrap="wrap" style={{ minWidth: 0 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {stripOoo(row.customer)}
                        </span>
                        {rowHasEdoPartner(row.items, edoPartnerInns) ? <DocumentsEdoPartnerBadge /> : null}
                      </Flex>
                    </td>
                  ) : null}
                  {showCustomerColumn ? (
                    <td className="documents-edo-inn-col" style={{ padding: "0.5rem 0.4rem", maxWidth: 140 }} onClick={(e) => e.stopPropagation()}>
                      <DocumentsInnCopyCell inn={pickRowInn(row.items)} />
                    </td>
                  ) : null}
                  <td style={{ padding: "0.5rem 0.4rem", textAlign: "right" }}>{row.items.length}</td>
                  {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
                    <td
                      key={k}
                      style={{ padding: "0.5rem 0.35rem", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
                      title="Подписано / всего по ЭДО для этого типа документа"
                    >
                      {formatEdoSignedRatio(rowEdoAgg[k].signed, rowEdoAgg[k].total)}
                    </td>
                  ))}
                </motion.tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={baseColCount} style={{ padding: 0, borderBottom: "1px solid var(--color-border)", verticalAlign: "top", background: "var(--color-bg-primary)" }}>
                      <motion.div {...(docsMotionEnabled ? cargoExpandMotionProps : { initial: false })} style={{ padding: "0.5rem", overflowX: "auto" }}>
                        <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}>Номер</th>
                              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}>Дата</th>
                              {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
                                <th key={k} style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}>
                                  {k === "СЧЕТ" ? "Счёт" : k}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>{renderEdoInvoiceInnerRows(row.items, onOpenInvoice)}</tbody>
                        </table>
                      </motion.div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
            {showCustomerColumn ? (
              <td className="customer-col" style={{ padding: "0.5rem 0.4rem", fontWeight: 700 }}>Итого</td>
            ) : (
              <td style={{ padding: "0.5rem 0.4rem", fontWeight: 700 }}>Итого</td>
            )}
            {showCustomerColumn ? (
              <td className="documents-edo-inn-col" style={{ padding: "0.5rem 0.4rem", fontWeight: 700, color: "var(--color-text-secondary)" }}>
                —
              </td>
            ) : null}
            <td style={{ padding: "0.5rem 0.4rem", textAlign: "right", fontWeight: 700 }}>{invoicesCount}</td>
            {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
              <td
                key={k}
                style={{ padding: "0.5rem 0.35rem", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
                title="Итого по всем счетам в выборке"
              >
                {formatEdoSignedRatio(totals[k].signed, totals[k].total)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

type EdoMonitorCardsProps = {
  rows: EdoMonitorCustomerRow[];
  totals: Record<InvoiceEdoMergedDocLabel, InvoiceEdoDocAgg>;
  invoicesCount: number;
  expandedCustomer: string | null;
  onToggleCustomer: (customer: string) => void;
  onOpenInvoice: (inv: any) => void;
  docsMotionEnabled?: boolean;
  edoPartnerInns?: ReadonlySet<string>;
};

function edoColumnTitle(k: InvoiceEdoMergedDocLabel): string {
  return k === "СЧЕТ" ? "Счета" : k;
}

export function DocumentsEdoMonitorGroupedCards({
  rows,
  totals,
  invoicesCount,
  expandedCustomer,
  onToggleCustomer,
  onOpenInvoice,
  docsMotionEnabled = false,
  edoPartnerInns,
}: EdoMonitorCardsProps) {
  return (
    <div className="documents-edo-monitor-cards">
      <Typography.Body className="documents-edo-monitor-cards__intro">
        Монитор ЭДО по счетам: подписано / всего с непустым статусом по типу документа.
      </Typography.Body>
      <div className="cargo-list">
        {rows.map((row, i) => {
          const rowEdoAgg = aggregateInvoiceEdoDocStats(row.items);
          const isExpanded = expandedCustomer === row.customer;
          const customerLabel = stripOoo(row.customer) || "—";
          return (
            <motion.div
              key={`${row.customer}-${i}`}
              variants={docsMotionEnabled ? documentsListItemVariants : undefined}
              initial={docsMotionEnabled ? "hidden" : false}
              animate={docsMotionEnabled ? "visible" : undefined}
            >
              <Panel
                className="cargo-card documents-edo-monitor-card"
                onClick={() => onToggleCustomer(row.customer)}
                style={{ cursor: "pointer", position: "relative" }}
                title={isExpanded ? "Свернуть" : "Показать счета"}
              >
                <Flex className="documents-edo-monitor-card__header" justify="space-between" align="start" style={{ marginBottom: "0.55rem", minWidth: 0, gap: "0.5rem" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Flex align="center" gap="0.35rem" wrap="wrap" style={{ minWidth: 0 }}>
                      <Typography.Body className="documents-edo-monitor-card__customer" style={{ fontWeight: 600, fontSize: "1rem", minWidth: 0 }} title={customerLabel}>
                        {customerLabel}
                      </Typography.Body>
                      {rowHasEdoPartner(row.items, edoPartnerInns) ? <DocumentsEdoPartnerBadge /> : null}
                    </Flex>
                    {(() => {
                      const rowInn = pickRowInn(row.items);
                      return rowInn ? (
                        <div style={{ marginTop: "0.25rem" }} onClick={(e) => e.stopPropagation()}>
                          <DocumentsInnCopyCell inn={rowInn} />
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <Flex className="documents-edo-monitor-card__header-actions" align="center" gap="0.35rem">
                    <AppBadge tone="neutral">{row.items.length} сч.</AppBadge>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                    ) : (
                      <ChevronDown className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                    )}
                  </Flex>
                </Flex>
                <div className="documents-edo-monitor-card__stats">
                  {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
                    <div key={k} className="documents-edo-monitor-card__stat">
                      <Typography.Label className="documents-edo-monitor-card__stat-label">{edoColumnTitle(k)}</Typography.Label>
                      <Typography.Body className="documents-edo-monitor-card__stat-value" title="Подписано / всего">
                        {formatEdoSignedRatio(rowEdoAgg[k].signed, rowEdoAgg[k].total)}
                      </Typography.Body>
                    </div>
                  ))}
                </div>
                {isExpanded && (
                  <motion.div
                    {...(docsMotionEnabled ? cargoExpandMotionProps : { initial: false })}
                    className="documents-edo-monitor-card__invoices"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {row.items.map((inv: any, j: number) => {
                      const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? "";
                      const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? "";
                      return (
                        <button
                          key={String(inum) || j}
                          type="button"
                          className="documents-edo-monitor-card__invoice-row"
                          onClick={() => onOpenInvoice(inv)}
                          title="Открыть счёт"
                        >
                          <Flex justify="space-between" align="center" wrap="wrap" gap="0.35rem" style={{ width: "100%", minWidth: 0 }}>
                            <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>{formatInvoiceNumber(inum)}</Typography.Body>
                            <Typography.Label style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                              <DateText value={typeof idt === "string" ? idt : idt ? String(idt) : undefined} />
                            </Typography.Label>
                          </Flex>
                          <Flex className="documents-edo-monitor-card__edo-badges" gap="0.35rem" wrap="wrap" style={{ marginTop: "0.35rem" }}>
                            {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
                              <DocumentsEdoCardBadge key={k} docLabel={k} compact info={getInvoiceEdoInfoByDocLabel(inv, k)} />
                            ))}
                          </Flex>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </Panel>
            </motion.div>
          );
        })}
        <Panel className="cargo-card documents-edo-monitor-card documents-edo-monitor-card--totals">
          <Typography.Body style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.55rem" }}>Итого</Typography.Body>
          <Flex justify="space-between" align="center" style={{ marginBottom: "0.45rem" }}>
            <Typography.Label style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>Счетов</Typography.Label>
            <Typography.Body style={{ fontWeight: 700 }}>{invoicesCount}</Typography.Body>
          </Flex>
          <div className="documents-edo-monitor-card__stats">
            {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
              <div key={k} className="documents-edo-monitor-card__stat">
                <Typography.Label className="documents-edo-monitor-card__stat-label">{edoColumnTitle(k)}</Typography.Label>
                <Typography.Body className="documents-edo-monitor-card__stat-value" title="Итого по всем счетам в выборке">
                  {formatEdoSignedRatio(totals[k].signed, totals[k].total)}
                </Typography.Body>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function invoicePaymentBadgeStyle(st: string): { bg: string; color: string } {
  if (st === "Оплачен") return { bg: "rgba(34, 197, 94, 0.2)", color: "#22c55e" };
  if (st === "Оплачен частично") return { bg: "rgba(234, 179, 8, 0.2)", color: "#ca8a04" };
  if (st === "Не оплачен") return { bg: "rgba(239, 68, 68, 0.2)", color: "#ef4444" };
  return { bg: "var(--color-panel-secondary)", color: "var(--color-text-secondary)" };
}

export type DocumentsInvoiceCardProps = {
  row: any;
  onOpen: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** Бейджи ЭДО в правом нижнем углу (плитки «Счета» / «ЭДО»). */
  showEdoCornerBadges?: boolean;
  edoPartnerInns?: ReadonlySet<string>;
};

export function DocumentsInvoiceCard({
  row,
  onOpen,
  isFavorite,
  onToggleFavorite,
  showEdoCornerBadges = false,
  edoPartnerInns,
}: DocumentsInvoiceCardProps) {
  const num = row.Number ?? row.number ?? row.Номер ?? row.N ?? "";
  const dt = row.DateDoc ?? row.Date ?? row.date ?? row.Дата ?? "";
  const payTill = getPayTillDate(typeof dt === "string" ? dt : dt ? String(dt) : undefined);
  const cust = row.Customer ?? row.customer ?? row.Контрагент ?? row.Contractor ?? row.Organization ?? "";
  const sum = invoiceDocSum(row);
  const rawStatus = row.Status ?? row.State ?? row.state ?? row.Статус ?? "";
  const st = (normalizeInvoiceStatus(rawStatus) || rawStatus) as string;
  const badgeStyle = invoicePaymentBadgeStyle(st);
  const isFerry = row.AK === true || row.AK === "true" || row.AK === "1" || row.AK === 1;

  const onShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines = [
      `Счёт: ${formatInvoiceNumber(num)}`,
      cust && `Заказчик: ${stripOoo(String(cust))}`,
      sum != null && `Сумма: ${formatCurrency(sum)}`,
      dt && `Дата: ${typeof dt === "string" ? dt : String(dt)}`,
      payTill && `Оплата до: ${payTill}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
        .share({ title: `Счёт ${formatInvoiceNumber(num)}`, text })
        .catch(() => {});
    } else {
      try {
        void navigator.clipboard?.writeText(text);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Panel
      className="cargo-card documents-invoice-card"
      onClick={onOpen}
      style={{
        cursor: "pointer",
        marginBottom: "0.75rem",
        position: "relative",
      }}
    >
      <Flex justify="space-between" align="start" style={{ marginBottom: "0.5rem", minWidth: 0, overflow: "visible" }}>
        <Flex align="center" gap="0.5rem" style={{ flexWrap: "wrap", flex: "0 1 auto", minWidth: 0, maxWidth: "60%" }}>
          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: badgeStyle.color }}>
            {formatInvoiceNumber(num)}
          </Typography.Body>
        </Flex>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={onShare}
            title="Поделиться"
          >
            <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
          </Button>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={isFavorite ? "Удалить из избранного" : "В избранное"}
          >
            <Heart
              className="w-4 h-4"
              style={{
                fill: isFavorite ? "#ef4444" : "transparent",
                color: isFavorite ? "#ef4444" : "var(--color-text-secondary)",
              }}
            />
          </Button>
          <Typography.Label className="text-theme-secondary" style={{ fontSize: "0.85rem" }}>
            <DateText value={typeof dt === "string" ? dt : dt ? String(dt) : undefined} />
          </Typography.Label>
        </Flex>
      </Flex>
      <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem" }}>
        <Flex align="center" gap="0.35rem" style={{ minWidth: 0 }}>
          {st ? (
            <AppBadge tone="neutral" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
              {st}
            </AppBadge>
          ) : null}
        </Flex>
        <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}>
          {sum != null ? formatCurrency(sum) : "—"}
        </Typography.Body>
      </Flex>
      <Flex justify="space-between" align="center" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
        <Flex align="center" gap="0.35rem" wrap="wrap" style={{ minWidth: 0, maxWidth: "70%" }}>
          <Typography.Label
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
            title={stripOoo(String(cust || ""))}
          >
            {stripOoo(String(cust || "—"))}
          </Typography.Label>
          {innIsEdoPartner(edoPartnerInns, getItemInn(row)) ? <DocumentsEdoPartnerBadge /> : null}
        </Flex>
        <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }}>
          {(row.CitySender || row.CityReceiver) ? (
            <RouteBadge route={formatRouteLabel(row.CitySender, row.CityReceiver)} />
          ) : null}
          <CargoTransportTypeIcon ak={row.AK} />
        </Flex>
      </Flex>
      {payTill && (
        <Flex
          align="center"
          gap="0.35rem"
          style={{
            fontSize: "0.8rem",
            color: getPayTillDateColor(payTill, st === "Оплачен") ?? "var(--color-text-secondary)",
            marginTop: "0.25rem",
          }}
        >
          <Typography.Label>Оплата до:</Typography.Label>
          <DateText value={payTill} />
        </Flex>
      )}
      {showEdoCornerBadges ? (
        <Flex
          className="documents-invoice-card__edo-badges"
          gap="0.25rem"
          wrap="wrap"
          justify="flex-start"
          style={{ width: "100%", marginTop: "0.4rem", pointerEvents: "none" }}
        >
          {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
            <DocumentsEdoCardBadge key={k} docLabel={k} compact info={getInvoiceEdoInfoByDocLabel(row, k)} />
          ))}
        </Flex>
      ) : null}
    </Panel>
  );
}

function actEdoSource(act: any, invoices: any[] | null | undefined): any {
  return findInvoiceLinkedToAct(act, invoices) ?? act;
}

export type DocumentsActCardProps = {
  act: any;
  invoices?: any[] | null;
  onOpen: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  showSums?: boolean;
  showEdoBadges?: boolean;
};

/** Плитка УПД — тот же каркас, что у счёта, бейджи ЭДО из связанного счёта. */
export function DocumentsActCard({
  act,
  invoices,
  onOpen,
  isFavorite,
  onToggleFavorite,
  showSums = true,
  showEdoBadges = true,
}: DocumentsActCardProps) {
  const num = act.Number ?? act.number ?? "";
  const dateDoc = act.DateDoc ?? act.Date ?? act.date ?? "";
  const sumDoc = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
  const cust = act.Customer ?? act.customer ?? act.Контрагент ?? act.Contractor ?? act.Organization ?? "";
  const invoiceNum = act.Invoice ?? act.invoice ?? "";
  const isFerry = act.AK === true || act.AK === "true" || act.AK === "1" || act.AK === 1;
  const edoSource = actEdoSource(act, invoices);

  const onShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines = [
      `УПД: ${formatInvoiceNumber(String(num))}`,
      cust && `Заказчик: ${stripOoo(String(cust))}`,
      sumDoc != null && `Сумма: ${formatCurrency(sumDoc)}`,
      dateDoc && `Дата: ${typeof dateDoc === "string" ? dateDoc : String(dateDoc)}`,
      invoiceNum && `Счёт: ${formatInvoiceNumber(String(invoiceNum))}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
        .share({ title: `УПД ${formatInvoiceNumber(String(num))}`, text })
        .catch(() => {});
    } else {
      try {
        void navigator.clipboard?.writeText(text);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Panel
      className="cargo-card documents-invoice-card documents-act-card"
      onClick={onOpen}
      style={{ cursor: "pointer", marginBottom: "0.75rem", position: "relative" }}
      title="Открыть УПД"
    >
      <Flex justify="space-between" align="start" style={{ marginBottom: "0.5rem", minWidth: 0, overflow: "visible" }}>
        <Flex align="center" gap="0.5rem" style={{ flexWrap: "wrap", flex: "0 1 auto", minWidth: 0, maxWidth: "60%" }}>
          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}>
            {formatInvoiceNumber(String(num))}
          </Typography.Body>
        </Flex>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={onShare}
            title="Поделиться"
          >
            <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
          </Button>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={isFavorite ? "Удалить из избранного" : "В избранное"}
          >
            <Heart
              className="w-4 h-4"
              style={{
                fill: isFavorite ? "#ef4444" : "transparent",
                color: isFavorite ? "#ef4444" : "var(--color-text-secondary)",
              }}
            />
          </Button>
          <Typography.Label className="text-theme-secondary" style={{ fontSize: "0.85rem" }}>
            <DateText value={typeof dateDoc === "string" ? dateDoc : dateDoc ? String(dateDoc) : undefined} />
          </Typography.Label>
        </Flex>
      </Flex>
      {showSums ? (
        <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem" }}>
          <span />
          <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}>
            {sumDoc != null ? formatCurrency(sumDoc) : "—"}
          </Typography.Body>
        </Flex>
      ) : null}
      <Flex justify="space-between" align="center" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: showEdoBadges ? "0.4rem" : 0 }}>
        <Typography.Label
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}
          title={stripOoo(String(cust || ""))}
        >
          {stripOoo(String(cust || "—"))}
        </Typography.Label>
        <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }}>
          {(act.CitySender || act.CityReceiver) ? (
            <RouteBadge route={formatRouteLabel(act.CitySender, act.CityReceiver)} />
          ) : invoiceNum ? (
            <Typography.Label style={{ fontSize: "0.85rem" }}>Счёт {formatInvoiceNumber(String(invoiceNum))}</Typography.Label>
          ) : null}
          <CargoTransportTypeIcon ak={act.AK} />
        </Flex>
      </Flex>
      {showEdoBadges ? (
        <Flex
          className="documents-invoice-card__edo-badges"
          gap="0.25rem"
          wrap="wrap"
          justify="flex-start"
          style={{ width: "100%", marginTop: "0.1rem", pointerEvents: "none" }}
        >
          {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
            <DocumentsEdoCardBadge key={k} docLabel={k} compact info={getInvoiceEdoInfoByDocLabel(edoSource, k)} />
          ))}
        </Flex>
      ) : null}
    </Panel>
  );
}

export type DocumentsActCardsListProps = {
  acts: any[];
  invoices?: any[] | null;
  onOpenAct: (act: any) => void;
  isActFavorite: (num: string) => boolean;
  onToggleActFavorite: (num: string) => void;
  docsMotionEnabled?: boolean;
  showSums?: boolean;
  showEdoBadges?: boolean;
};

/** Список плиток УПД — тот же вид, что в разделе «Счета» (с бейджами ЭДО). */
export function DocumentsActCardsList({
  acts,
  invoices,
  onOpenAct,
  isActFavorite,
  onToggleActFavorite,
  docsMotionEnabled = false,
  showSums = true,
  showEdoBadges = true,
}: DocumentsActCardsListProps) {
  return (
    <motion.div
      className="cargo-list"
      variants={docsMotionEnabled ? cargoListContainerVariants : undefined}
      initial={docsMotionEnabled ? "hidden" : false}
      animate={docsMotionEnabled ? "visible" : undefined}
    >
      {acts.map((act, idx) => {
        const num = String(act.Number ?? act.number ?? "");
        return (
          <motion.div
            key={num || idx}
            variants={docsMotionEnabled ? documentsListItemVariants : undefined}
            initial={docsMotionEnabled ? "hidden" : false}
            animate={docsMotionEnabled ? "visible" : undefined}
          >
            <DocumentsActCard
              act={act}
              invoices={invoices}
              onOpen={() => onOpenAct(act)}
              isFavorite={isActFavorite(num)}
              onToggleFavorite={() => onToggleActFavorite(num)}
              showSums={showSums}
              showEdoBadges={showEdoBadges}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export type DocumentsEdoCargoCardProps = {
  item: EdoCargoCardItem;
  onOpen: () => void;
  onOpenCargo?: (cargoNumber: string) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  edoPartnerInns?: ReadonlySet<string>;
};

/** Плитка перевозки в разделе «ЭДО» — тот же каркас, что у счёта, статусы ЭДО в теле карточки. */
export function DocumentsEdoCargoCard({ item, onOpen, onOpenCargo, isFavorite, onToggleFavorite, edoPartnerInns }: DocumentsEdoCargoCardProps) {
  const { cargoNumber, invoice, cargo } = item;
  const invNum = invoice.Number ?? invoice.number ?? invoice.Номер ?? invoice.N ?? "";
  const dt = cargo?.DatePrih ?? invoice.DateDoc ?? invoice.Date ?? invoice.date ?? invoice.Дата ?? "";
  const cust =
    cargo?.Customer ??
    cargo?.customer ??
    invoice.Customer ??
    invoice.customer ??
    invoice.Контрагент ??
    invoice.Contractor ??
    invoice.Organization ??
    "";
  const sum = invoiceDocSum(invoice);
  const rawStatus = invoice.Status ?? invoice.State ?? invoice.state ?? invoice.Статус ?? "";
  const st = (normalizeInvoiceStatus(rawStatus) || rawStatus) as string;
  const badgeStyle = invoicePaymentBadgeStyle(st);
  const isFerry =
    cargo?.AK === true ||
    cargo?.AK === "true" ||
    cargo?.AK === "1" ||
    cargo?.AK === 1 ||
    invoice.AK === true ||
    invoice.AK === "true" ||
    invoice.AK === "1" ||
    invoice.AK === 1;
  const routeFromCargo = [cityToCode(cargo?.CitySender), cityToCode(cargo?.CityReceiver)].filter(Boolean).join(" – ");
  const routeFromInvoice = [cityToCode(invoice.CitySender), cityToCode(invoice.CityReceiver)].filter(Boolean).join(" – ");
  const route = routeFromCargo || routeFromInvoice;

  const onShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const lines = [
      `Перевозка: ${formatInvoiceNumber(cargoNumber)}`,
      invNum && `Счёт: ${formatInvoiceNumber(String(invNum))}`,
      cust && `Заказчик: ${stripOoo(String(cust))}`,
      cargo?.State && `Статус: ${String(cargo.State)}`,
      sum != null && `Сумма: ${formatCurrency(sum)}`,
      dt && `Дата: ${typeof dt === "string" ? dt : String(dt)}`,
      route && `Маршрут: ${route}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      void (navigator as Navigator & { share: (d: ShareData) => Promise<void> })
        .share({ title: `Перевозка ${formatInvoiceNumber(cargoNumber)}`, text })
        .catch(() => {});
    } else {
      try {
        void navigator.clipboard?.writeText(text);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Panel
      className="cargo-card documents-invoice-card documents-edo-cargo-card"
      onClick={onOpen}
      style={{ cursor: "pointer", marginBottom: "0.75rem", position: "relative" }}
      title="Открыть счёт"
    >
      <Flex justify="space-between" align="start" style={{ marginBottom: "0.5rem", minWidth: 0, overflow: "visible" }}>
        <Flex align="center" gap="0.5rem" style={{ flexWrap: "wrap", flex: "0 1 auto", minWidth: 0, maxWidth: "60%" }}>
          <ClickableCargoNumber
            number={cargoNumber}
            onOpen={onOpenCargo}
            style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)" }}
          />
        </Flex>
        <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={onShare}
            title="Поделиться"
          >
            <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
          </Button>
          <Button
            style={{ padding: "0.25rem", minWidth: "auto", background: "transparent", border: "none", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            title={isFavorite ? "Удалить из избранного" : "В избранное"}
          >
            <Heart
              className="w-4 h-4"
              style={{
                fill: isFavorite ? "#ef4444" : "transparent",
                color: isFavorite ? "#ef4444" : "var(--color-text-secondary)",
              }}
            />
          </Button>
          <Typography.Label className="text-theme-secondary" style={{ fontSize: "0.85rem" }}>
            <DateText value={typeof dt === "string" ? dt : dt ? String(dt) : undefined} />
          </Typography.Label>
        </Flex>
      </Flex>
      <Flex justify="space-between" align="center" style={{ marginBottom: "0.5rem", gap: "0.35rem", flexWrap: "wrap" }}>
        <Flex align="center" gap="0.35rem" wrap="wrap" className="documents-invoice-card__status-badges" style={{ minWidth: 0 }}>
          {cargo?.State != null ? <StatusBadge status={cargo.State} /> : null}
          {st ? (
            <AppBadge tone="neutral" style={{ background: badgeStyle.bg, color: badgeStyle.color }}>
              {st}
            </AppBadge>
          ) : null}
        </Flex>
        <Typography.Body style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-primary)", flexShrink: 0 }}>
          {sum != null ? formatCurrency(sum) : "—"}
        </Typography.Body>
      </Flex>
      <Flex justify="space-between" align="center" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.45rem" }}>
        <Flex align="center" gap="0.35rem" wrap="wrap" style={{ minWidth: 0, maxWidth: "70%" }}>
          <Typography.Label
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
            title={stripOoo(String(cust || ""))}
          >
            {stripOoo(String(cust || "—"))}
          </Typography.Label>
          {innIsEdoPartner(edoPartnerInns, getItemInn(invoice) || getItemInn(cargo)) ? <DocumentsEdoPartnerBadge /> : null}
        </Flex>
        <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }}>
          {route ? <RouteBadge route={route} /> : null}
          <CargoTransportTypeIcon ak={isFerry} />
        </Flex>
      </Flex>
      {invNum ? (
        <Typography.Label style={{ display: "block", fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.4rem" }}>
          Счёт:{" "}
          <ClickableInvoiceNumber number={String(invNum)} invoice={invoice} onOpen={(_inv) => onOpen()} />
        </Typography.Label>
      ) : null}
      <Flex className="documents-edo-cargo-card__edo-badges" gap="0.35rem" wrap="wrap">
        {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
          <DocumentsEdoCardBadge key={k} docLabel={k} compact info={getInvoiceEdoInfoByDocLabel(invoice, k)} />
        ))}
      </Flex>
    </Panel>
  );
}

export type DocumentsEdoCardsListProps = {
  items: EdoCargoCardItem[];
  onOpenInvoice: (inv: any) => void;
  onOpenCargo?: (cargoNumber: string) => void;
  isInvoiceFavorite: (num: string) => boolean;
  onToggleInvoiceFavorite: (num: string) => void;
  docsMotionEnabled?: boolean;
  edoPartnerInns?: ReadonlySet<string>;
};

/** Список плиток ЭДО: 1 карточка = 1 перевозка. */
export function DocumentsEdoCardsList({
  items,
  onOpenInvoice,
  onOpenCargo,
  isInvoiceFavorite,
  onToggleInvoiceFavorite,
  docsMotionEnabled = false,
  edoPartnerInns,
}: DocumentsEdoCardsListProps) {
  return (
    <motion.div
      className="cargo-list"
      variants={docsMotionEnabled ? cargoListContainerVariants : undefined}
      initial={docsMotionEnabled ? "hidden" : false}
      animate={docsMotionEnabled ? "visible" : undefined}
    >
      {items.map((item, idx) => {
        const invNum = String(item.invoice.Number ?? item.invoice.number ?? item.invoice.Номер ?? item.invoice.N ?? "");
        return (
          <motion.div
            key={`${item.cargoKey}-${idx}`}
            variants={docsMotionEnabled ? documentsListItemVariants : undefined}
            initial={docsMotionEnabled ? "hidden" : false}
            animate={docsMotionEnabled ? "visible" : undefined}
          >
            <DocumentsEdoCargoCard
              item={item}
              onOpen={() => onOpenInvoice(item.invoice)}
              onOpenCargo={onOpenCargo}
              isFavorite={isInvoiceFavorite(invNum)}
              onToggleFavorite={() => onToggleInvoiceFavorite(invNum)}
              edoPartnerInns={edoPartnerInns}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export type DocumentsInvoiceCardsListProps = {
  items: any[];
  onOpenInvoice: (inv: any) => void;
  isInvoiceFavorite: (num: string) => boolean;
  onToggleInvoiceFavorite: (num: string) => void;
  docsMotionEnabled?: boolean;
  showEdoCornerBadges?: boolean;
  edoPartnerInns?: ReadonlySet<string>;
};

/** Список плиток счетов — тот же вид, что в разделе «Счета». */
export function DocumentsInvoiceCardsList({
  items,
  onOpenInvoice,
  isInvoiceFavorite,
  onToggleInvoiceFavorite,
  docsMotionEnabled = false,
  showEdoCornerBadges = false,
  edoPartnerInns,
}: DocumentsInvoiceCardsListProps) {
  return (
    <>
      <motion.div
        className="cargo-list"
        variants={docsMotionEnabled ? cargoListContainerVariants : undefined}
        initial={docsMotionEnabled ? "hidden" : false}
        animate={docsMotionEnabled ? "visible" : undefined}
      >
        {items.map((row, idx) => {
          const num = String(row.Number ?? row.number ?? row.Номер ?? row.N ?? "");
          return (
            <motion.div
              key={num || idx}
              variants={docsMotionEnabled ? documentsListItemVariants : undefined}
              initial={docsMotionEnabled ? "hidden" : false}
              animate={docsMotionEnabled ? "visible" : undefined}
            >
              <DocumentsInvoiceCard
                row={row}
                onOpen={() => onOpenInvoice(row)}
                isFavorite={isInvoiceFavorite(num)}
                onToggleFavorite={() => onToggleInvoiceFavorite(num)}
                showEdoCornerBadges={showEdoCornerBadges}
                edoPartnerInns={edoPartnerInns}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
}

type SummaryProps = {
  summary: DocsSummaryTotals;
  showSums: boolean;
  useServiceRequest: boolean;
  /** Визуал KPI-плиток в духе SaaS analytics (зарегистрированный пользователь + служебный режим). */
  saasAnalytics?: boolean;
  /** Одна компания в табличном режиме: все итоги в плитках, без строки «Итого» в таблице. */
  expandedMetrics?: boolean;
};

export function DocumentsSummaryCard({
  summary,
  showSums,
  useServiceRequest,
  saasAnalytics = false,
  expandedMetrics = false,
}: SummaryProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DOCS_SUMMARY_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    try {
      localStorage.setItem(DOCS_SUMMARY_COLLAPSED_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed, isMobile]);

  const labelStyle = (): React.CSSProperties =>
    saasAnalytics
      ? {
          fontSize: "0.68rem",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          letterSpacing: "0.04em",
          opacity: 0.92,
        }
      : { fontSize: "0.75rem", color: "var(--color-text-secondary)" };
  const valueStyle = (): React.CSSProperties =>
    saasAnalytics
      ? {
          fontWeight: 700,
          fontSize: "1.06rem",
          letterSpacing: "-0.02em",
          color: "var(--color-text-primary)",
        }
      : { fontWeight: 600, fontSize: "0.9rem" };

  const showMetrics = !isMobile || !collapsed;

  return (
    <div
      className={`cargo-card documents-summary-card cargo-summary-totals mb-4${saasAnalytics ? " documents-summary-totals--saas-kpi cargo-summary-totals--saas-kpi" : ""}${isMobile && collapsed ? " cargo-summary-totals--collapsed" : ""}`}
      style={{
        padding: isMobile && collapsed ? "0.45rem 0.55rem" : saasAnalytics ? undefined : "0.95rem 0.85rem 0.85rem",
        marginBottom: isMobile && collapsed ? "0.45rem" : saasAnalytics ? undefined : "1rem",
      }}
    >
      {isMobile && (
        <button
          type="button"
          className="cargo-summary-totals-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Развернуть итоги" : "Свернуть итоги"}
        >
          <Typography.Body style={{ fontSize: "0.78rem", fontWeight: 600 }}>Итого по выборке</Typography.Body>
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      )}
      {showMetrics && (
        <div className="summary-metrics">
          {showSums && (
            <Flex direction="column" align="center">
              <Typography.Label style={labelStyle()}>Сумма</Typography.Label>
              <Typography.Body style={valueStyle()}>{formatCurrency(summary.sum, true)}</Typography.Body>
            </Flex>
          )}
          <Flex direction="column" align="center">
            <Typography.Label style={labelStyle()}>Мест</Typography.Label>
            <Typography.Body style={valueStyle()}>{Math.round(summary.mest)}</Typography.Body>
          </Flex>
          <Flex direction="column" align="center">
            <Typography.Label style={labelStyle()}>Плат. вес</Typography.Label>
            <Typography.Body style={valueStyle()}>{Math.round(summary.pw)} кг</Typography.Body>
          </Flex>
          {(expandedMetrics || useServiceRequest) && (
            <>
              <Flex direction="column" align="center">
                <Typography.Label style={labelStyle()}>Вес</Typography.Label>
                <Typography.Body style={valueStyle()}>{Math.round(summary.w)} кг</Typography.Body>
              </Flex>
              <Flex direction="column" align="center">
                <Typography.Label style={labelStyle()}>Объём</Typography.Label>
                <Typography.Body style={valueStyle()}>{Math.round(summary.vol)} м³</Typography.Body>
              </Flex>
            </>
          )}
          <Flex direction="column" align="center">
            <Typography.Label style={labelStyle()}>Документов</Typography.Label>
            <Typography.Body style={valueStyle()}>{summary.count}</Typography.Body>
          </Flex>
        </div>
      )}
    </div>
  );
}

type StateProps = {
  loading: boolean;
  error?: string | null;
  emptyText: string;
};

export function DocumentsStateBlocks({ loading, error, emptyText }: StateProps) {
  if (loading) {
    return (
      <Flex justify="center" className="py-8">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-primary-blue)" }} />
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex align="center" className="mt-4" style={{ color: "var(--color-error)" }}>
        <AlertTriangle className="w-5 h-5 mr-2" />
        <Typography.Body>{error}</Typography.Body>
      </Flex>
    );
  }

  return (
    <Typography.Body style={{ color: "var(--color-text-secondary)", padding: "2rem 0" }}>
      {emptyText}
    </Typography.Body>
  );
}

/** Контент под липкой SaaS-карточкой; зазор задаёт `--app-block-stack-gap` на `.documents-page--saas-analytics`. */
export function DocumentsToolbarBelowSticky({ children }: { children: React.ReactNode }) {
  return <div className="documents-toolbar-below-sticky">{children}</div>;
}

export type DocumentsApiDebugSnapshot = {
  fetchedAt: string;
  url: string;
  status: number | null;
  ok: boolean;
  error?: string;
  body: unknown;
  listKey?: string;
  listLength?: number;
  filteredLength?: number;
};

type DocumentsApiDebugPanelProps = {
  title: string;
  snapshot: DocumentsApiDebugSnapshot | null;
  loading?: boolean;
};

export function DocumentsApiDebugPanel({ title, snapshot, loading }: DocumentsApiDebugPanelProps) {
  const bodyKeys =
    snapshot?.body && typeof snapshot.body === "object" && snapshot.body !== null
      ? Object.keys(snapshot.body as object)
      : [];

  return (
    <details className="documents-api-debug-panel" open style={{ marginBottom: "0.85rem" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
        Отладка API: {title}
        {loading ? " (загрузка…)" : snapshot ? ` — HTTP ${snapshot.status ?? "—"}` : ""}
      </summary>
      <div
        style={{
          marginTop: "0.5rem",
          padding: "0.65rem 0.75rem",
          borderRadius: 10,
          border: "1px solid var(--color-border)",
          background: "var(--color-bg-hover)",
          fontSize: "0.78rem",
          lineHeight: 1.4,
        }}
      >
        {loading && !snapshot ? (
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Запрос выполняется…</Typography.Body>
        ) : null}
        {!loading && !snapshot ? (
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>Ответ ещё не получен</Typography.Body>
        ) : null}
        {snapshot ? (
          <>
            <div style={{ marginBottom: "0.45rem", color: "var(--color-text-secondary)" }}>
              <div>
                <strong>URL:</strong> {snapshot.url}
              </div>
              <div>
                <strong>Время:</strong> {snapshot.fetchedAt}
              </div>
              <div>
                <strong>HTTP:</strong> {snapshot.status ?? "—"} {snapshot.ok ? "(ok)" : "(ошибка)"}
              </div>
              {snapshot.error ? (
                <div style={{ color: "var(--color-error, #ef4444)" }}>
                  <strong>Ошибка:</strong> {snapshot.error}
                </div>
              ) : null}
              {snapshot.listKey != null ? (
                <div>
                  <strong>{snapshot.listKey}:</strong> {snapshot.listLength ?? 0} в ответе
                  {snapshot.filteredLength != null ? ` → ${snapshot.filteredLength} после фильтров UI` : ""}
                </div>
              ) : null}
              {bodyKeys.length > 0 ? (
                <div>
                  <strong>Ключи JSON:</strong> {bodyKeys.join(", ")}
                </div>
              ) : null}
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: "min(42vh, 320px)",
                overflow: "auto",
                padding: "0.55rem",
                borderRadius: 8,
                background: "var(--color-bg-primary)",
                border: "1px solid var(--color-border)",
                fontSize: "0.7rem",
                lineHeight: 1.35,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(snapshot.body, null, 2)}
            </pre>
          </>
        ) : null}
      </div>
    </details>
  );
}

/** Маршрут / город в таблицах «Документы» — единый info-pill. */
export function DocumentsRouteBadge({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <RouteBadge route={children} className={className} style={style} />;
}

/** Код маршрута тарифа (MSK – KGD). */
export function formatTariffRouteLabel(cityFrom?: string | null, cityTo?: string | null): string {
  const from = cityToCode(cityFrom || "") || String(cityFrom || "").trim();
  const to = cityToCode(cityTo || "") || String(cityTo || "").trim();
  return [from, to].filter(Boolean).join(" – ");
}

export function isTariffTransportFerry(transportType?: string | null): boolean {
  const t = String(transportType || "").trim().toLowerCase();
  return t.includes("паром") || t.includes("ferry") || t.includes("морск") || t === "море";
}

/** Иконка типа перевозки в тарифах: паром / авто. */
export function TariffTransportTypeIcon({
  transportType,
  size = 20,
}: {
  transportType?: string | null;
  size?: number;
}) {
  const label = String(transportType || "").trim();
  if (!label) return <span>—</span>;
  const ferry = isTariffTransportFerry(label);
  const Icon = ferry ? Ship : Truck;
  return (
    <span
      className="doc-tariff-transport-icon"
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-primary-blue, #2563eb)",
      }}
    >
      <Icon style={{ width: size, height: size }} strokeWidth={2} aria-hidden />
    </span>
  );
}
