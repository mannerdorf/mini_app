import React, { useEffect, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp, Loader2, Package } from "lucide-react";
import type { DateFilter } from "../types";
import { formatCurrency } from "../lib/formatUtils";

type CargoSummary = {
  sum: number;
  mest: number;
  pw: number;
  w: number;
  vol: number;
  count: number;
};

type CargoSummaryCardProps = {
  summary: CargoSummary;
  showSums: boolean;
  useServiceRequest: boolean;
  /** Визуал KPI-карточек в духе SaaS analytics (только служебный режим в приложении). */
  saasAnalytics?: boolean;
  /** Одна компания: в плитках показываем все итоги как в свёрнутой строке по заказчику. */
  expandedMetrics?: boolean;
};

const CARGO_SUMMARY_COLLAPSED_KEY = "haulz.cargo.summaryCollapsedMobile";

export function CargoSummaryCard({
  summary,
  showSums,
  useServiceRequest,
  saasAnalytics = false,
  expandedMetrics = false,
}: CargoSummaryCardProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(CARGO_SUMMARY_COLLAPSED_KEY) === "true";
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
      localStorage.setItem(CARGO_SUMMARY_COLLAPSED_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed, isMobile]);
  const mkLabelStyle = (): React.CSSProperties =>
    saasAnalytics
      ? {
          fontSize: "0.68rem",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          letterSpacing: "0.04em",
          opacity: 0.92,
        }
      : { fontSize: "0.75rem", color: "var(--color-text-secondary)" };
  const mkValueStyle = (): React.CSSProperties =>
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
      className={`cargo-card cargo-summary-totals mb-4${saasAnalytics ? " cargo-summary-totals--saas-kpi" : ""}${isMobile && collapsed ? " cargo-summary-totals--collapsed" : ""}`}
      style={{
        padding: isMobile && collapsed ? "0.45rem 0.55rem" : "0.95rem 0.85rem 0.85rem",
        marginBottom: isMobile && collapsed ? "0.45rem" : "0.85rem",
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
            <Typography.Label style={mkLabelStyle()}>Сумма</Typography.Label>
            <Typography.Body style={mkValueStyle()}>{formatCurrency(summary.sum, true)}</Typography.Body>
          </Flex>
        )}
        <Flex direction="column" align="center">
          <Typography.Label style={mkLabelStyle()}>Мест</Typography.Label>
          <Typography.Body style={mkValueStyle()}>{Math.round(summary.mest)}</Typography.Body>
        </Flex>
        <Flex direction="column" align="center">
          <Typography.Label style={mkLabelStyle()}>Плат. вес</Typography.Label>
          <Typography.Body style={mkValueStyle()}>{Math.round(summary.pw)} кг</Typography.Body>
        </Flex>
        {(expandedMetrics || useServiceRequest) && (
          <>
            <Flex direction="column" align="center">
              <Typography.Label style={mkLabelStyle()}>Вес</Typography.Label>
              <Typography.Body style={mkValueStyle()}>{Math.round(summary.w)} кг</Typography.Body>
            </Flex>
            <Flex direction="column" align="center">
              <Typography.Label style={mkLabelStyle()}>Объём</Typography.Label>
              <Typography.Body style={mkValueStyle()}>{Math.round(summary.vol)} м³</Typography.Body>
            </Flex>
          </>
        )}
        {expandedMetrics && (
          <Flex direction="column" align="center">
            <Typography.Label style={mkLabelStyle()}>Перевозок</Typography.Label>
            <Typography.Body style={mkValueStyle()}>{summary.count}</Typography.Body>
          </Flex>
        )}
      </div>
      )}
    </div>
  );
}

type CargoStateBlocksProps = {
  loading: boolean;
  error?: string | null;
  hasItems: boolean;
  onRetry: () => void;
  onSetDateFilter: (value: DateFilter) => void;
};

export function CargoStateBlocks({
  loading,
  error,
  hasItems,
  onRetry,
  onSetDateFilter,
}: CargoStateBlocksProps) {
  return (
    <>
      {loading && (
        <Flex justify="center" className="text-center py-8">
          <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
        </Flex>
      )}

      {!loading && error && (
        <Panel className="empty-state-card" style={{ marginBottom: "1rem" }}>
          <Flex direction="column" align="center">
            <Typography.Body
              style={{
                color: "var(--color-error)",
                textAlign: "center",
                marginBottom: "0.75rem",
              }}
            >
              {error}
            </Typography.Body>
            <Button className="filter-button" type="button" onClick={onRetry}>
              Повторить
            </Button>
          </Flex>
        </Panel>
      )}

      {!loading && !error && !hasItems && (
        <Panel className="empty-state-card">
          <Flex direction="column" align="center">
            <Package className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
            <Typography.Body className="text-theme-secondary">Ничего не найдено</Typography.Body>
            <Typography.Body
              className="text-theme-secondary"
              style={{ fontSize: "0.85rem", marginTop: "0.25rem", textAlign: "center" }}
            >
              Попробуйте изменить период или сбросить фильтры
            </Typography.Body>
            <Flex
              style={{
                gap: "0.5rem",
                marginTop: "0.75rem",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <Button
                className="filter-button"
                type="button"
                onClick={() => onSetDateFilter("месяц")}
                style={{ fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}
              >
                За месяц
              </Button>
              <Button
                className="filter-button"
                type="button"
                onClick={() => onSetDateFilter("все")}
                style={{ fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}
              >
                За всё время
              </Button>
            </Flex>
          </Flex>
        </Panel>
      )}
    </>
  );
}
