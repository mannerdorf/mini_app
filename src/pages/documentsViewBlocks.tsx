import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Loader2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "../lib/formatUtils";

type SummaryProps = {
  sum: number;
  count: number;
  showSums: boolean;
  /** Визуал KPI-плиток в духе SaaS analytics (зарегистрированный пользователь + служебный режим). */
  saasAnalytics?: boolean;
};

export function DocumentsSummaryCard({ sum, count, showSums, saasAnalytics = false }: SummaryProps) {
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

  return (
    <div
      className={`cargo-card documents-summary-card${saasAnalytics ? " documents-summary-totals--saas-kpi" : " mb-4"}`}
      style={saasAnalytics ? undefined : { padding: "0.95rem 0.85rem 0.85rem", marginBottom: "1rem" }}
    >
      <div className="summary-metrics">
        {showSums && (
          <Flex direction="column" align="center">
            <Typography.Label style={labelStyle()}>Сумма</Typography.Label>
            <Typography.Body style={valueStyle()}>{formatCurrency(sum)}</Typography.Body>
          </Flex>
        )}
        <Flex direction="column" align="center">
          <Typography.Label
            style={{
              ...labelStyle(),
              ...(saasAnalytics ? {} : { visibility: "hidden" }),
            }}
          >
            {saasAnalytics ? "Шт." : "—"}
          </Typography.Label>
          <Typography.Body style={valueStyle()}>{count}</Typography.Body>
        </Flex>
      </div>
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

