import React, { useEffect, useState } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp, Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "../lib/formatUtils";
import type { DocsSummaryTotals } from "./documentsPipeline";

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
