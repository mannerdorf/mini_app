import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency, formatInvoiceNumber, stripOoo } from "../lib/formatUtils";
import {
  EDO_LEGEND_ITEMS,
  aggregateInvoiceEdoDocStats,
  edoCardCornerBadgeStyle,
  edoToneTextColor,
  edoTableCellTextStyle,
  formatEdoSignedRatio,
  getEdoCardDisplayLabel,
  getEdoTableDisplayLabel,
  getInvoiceEdoInfoByDocLabel,
  INVOICE_EDO_MERGED_COLUMNS,
  type EdoStatusInfo,
  type InvoiceEdoDocAgg,
  type InvoiceEdoMergedDocLabel,
} from "../lib/edoStatus";
import { DateText } from "../components/ui/DateText";
import { cargoExpandMotionProps, cargoTableGroupRowVariants } from "./cargoMotion";
import type { DocsSummaryTotals } from "./documentsPipeline";

export function DocumentsEdoTableStatus({ info }: { info: EdoStatusInfo }) {
  return (
    <span style={edoTableCellTextStyle(info.tone)} title={info.label}>
      {getEdoTableDisplayLabel(info)}
    </span>
  );
}

export function DocumentsEdoCardBadge({ info }: { info: EdoStatusInfo }) {
  return (
    <span className="documents-edo-card-badge" style={edoCardCornerBadgeStyle(info.tone)} title={info.label}>
      {getEdoCardDisplayLabel(info)}
    </span>
  );
}

export function DocumentsEdoLegend({ style }: { style?: React.CSSProperties }) {
  return (
    <Flex gap="0.35rem" wrap="wrap" align="center" style={{ marginBottom: "0.75rem", flexShrink: 0, ...style }}>
      <Typography.Label style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginRight: "0.15rem" }}>
        Легенда ЭДО:
      </Typography.Label>
      {EDO_LEGEND_ITEMS.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? <span style={{ color: "var(--color-text-secondary)", fontSize: "0.65rem" }}>·</span> : null}
          <Typography.Label style={{ fontSize: "0.68rem", color: edoToneTextColor(item.tone) }}>{item.label}</Typography.Label>
        </React.Fragment>
      ))}
    </Flex>
  );
}

export type EdoMonitorCustomerRow = { customer: string; items: any[]; sum: number };

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
};

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
}: EdoMonitorTableProps) {
  const edoColCount = INVOICE_EDO_MERGED_COLUMNS.length;
  const baseColCount = 2 + edoColCount;

  return (
    <div className="cargo-card documents-edo-monitor-table" style={{ overflowX: "auto", marginBottom: "1rem" }}>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.55rem" }}>
        Монитор ЭДО по счетам: подписано / всего с непустым статусом по типу документа.
      </Typography.Body>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
            <th
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
                  <td
                    style={{ padding: "0.5rem 0.4rem", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={stripOoo(row.customer)}
                  >
                    {stripOoo(row.customer)}
                  </td>
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
                          <tbody>
                            {row.items.map((inv: any, j: number) => {
                              const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? "";
                              const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? "";
                              return (
                                <tr
                                  key={String(inum) || j}
                                  style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    onOpenInvoice(inv);
                                  }}
                                  title="Открыть счёт"
                                >
                                  <td style={{ padding: "0.35rem 0.3rem" }}>{formatInvoiceNumber(inum)}</td>
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
                            })}
                          </tbody>
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
            <td style={{ padding: "0.5rem 0.4rem", fontWeight: 700 }}>Итого</td>
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

type SummaryProps = {
  summary: DocsSummaryTotals;
  showSums: boolean;
  useServiceRequest: boolean;
  /** Визуал KPI-плиток в духе SaaS analytics (зарегистрированный пользователь + служебный режим). */
  saasAnalytics?: boolean;
};

const DOCS_SUMMARY_COLLAPSED_KEY = "haulz.documents.summaryCollapsedMobile";

export function DocumentsSummaryCard({ summary, showSums, useServiceRequest, saasAnalytics = false }: SummaryProps) {
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
          {useServiceRequest && (
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

/** Отступ под липкой карточкой вкладок/фильтров в «Документах» (см. `.documents-toolbar-below-sticky`). */
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
