import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Copy, Heart, Loader2, AlertTriangle, Share2, Ship, Truck } from "lucide-react";
import { PlaneIcon } from "../../../components/icons/PlaneIcon";
import { invoiceDocSum } from "../../../../lib/invoiceAmounts.js";
import { cityToCode, formatCurrency, formatInvoiceNumber, normalizeInvoiceStatus, stripOoo } from "../../../lib/formatUtils";
import { badgeLabelLowerFirst } from "../../../lib/statusUtils";
import { ClickableCargoNumber, ClickableInvoiceNumber } from "../../../components/ui/EntityLinks";
import { getPayTillDate, getPayTillDateColor } from "../../../lib/dateUtils";
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
} from "../../../lib/edoStatus";
import { DateText } from "../../../components/ui/DateText";
import { AppBadge } from "../../../components/shared/AppBadge";
import { RouteBadge, CargoTransportTypeIcon, formatRouteLabel } from "../../../components/shared/CargoTableDisplay";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { getSumColorByPaymentStatus } from "../../../lib/statusUtils";
import { cargoExpandMotionProps, cargoListContainerVariants, cargoTableGroupRowVariants, documentsListItemVariants } from "../../../pages/cargoMotion";
import { findInvoiceLinkedToAct, getItemInn, type DocsSummaryTotals, type EdoCargoCardItem } from "../lib/documentsPipeline";
import { innIsEdoPartner } from "../../../lib/edoCounterpartyStatus";
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

/** Бейджи счёта/УПД в таблице: 1) статус перевозки под номером, 2) маршрут слева / статус счёта справа. */
export function DocumentsInvoiceTableBadges({
  billStatus,
  billBadgeStyle,
  deliveryState,
  routeLabel,
  perevozkiLoading = false,
}: {
  billStatus?: string;
  billBadgeStyle?: { bg: string; color: string };
  deliveryState?: string;
  routeLabel?: React.ReactNode;
  perevozkiLoading?: boolean;
}) {
  const showBill = Boolean(billStatus);
  const routeText = routeLabel == null ? "" : String(routeLabel).trim();
  const showRoute = Boolean(routeText) && routeText !== "—";
  const showDelivery = perevozkiLoading || Boolean(deliveryState);
  if (!showBill && !showRoute && !showDelivery) return null;

  return (
    <div className="documents-invoice-table-badges cargo-inner-table__badges documents-invoices-inner-table__badges">
      {showDelivery ? (
        <div className="documents-invoice-table-badges__flow" aria-label="Статус перевозки">
          {perevozkiLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
          ) : (
            <StatusBadge status={deliveryState} />
          )}
        </div>
      ) : null}
      {(showBill || showRoute) && (
        <div className="documents-invoice-table-badges__meta">
          {showRoute ? (
            <span className="cargo-inner-table__route-inline documents-invoice-inner-badge-wrap documents-invoice-table-badges__meta-route">
              {perevozkiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
              ) : (
                <DocumentsRouteBadge className="documents-invoice-inner-badge">{routeLabel}</DocumentsRouteBadge>
              )}
            </span>
          ) : null}
          {showBill ? (
            <span className="documents-invoice-table-badges__meta-bill">
              <AppBadge
                tone="neutral"
                className="documents-invoice-inner-badge"
                style={{ background: billBadgeStyle?.bg, color: billBadgeStyle?.color }}
              >
                {badgeLabelLowerFirst(billStatus)}
              </AppBadge>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
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

export function isTariffTransportAir(transportType?: string | null): boolean {
  const t = String(transportType || "").trim().toLowerCase();
  return t.includes("авиа") || t.includes("air") || t.includes("самол");
}

/** Иконка типа перевозки в тарифах: паром / авиа / авто. */
export function TariffTransportTypeIcon({
  transportType,
  size = 20,
}: {
  transportType?: string | null;
  size?: number;
}) {
  const label = String(transportType || "").trim();
  if (!label) return <span>—</span>;
  const air = isTariffTransportAir(label);
  const ferry = isTariffTransportFerry(label);
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
      {air ? (
        <PlaneIcon width={size} height={size} title={label} />
      ) : ferry ? (
        <Ship style={{ width: size, height: size }} strokeWidth={2} aria-hidden />
      ) : (
        <Truck style={{ width: size, height: size }} strokeWidth={2} aria-hidden />
      )}
    </span>
  );
}

