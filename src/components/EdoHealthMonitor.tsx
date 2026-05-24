import React, { useMemo } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { ChevronRight, Loader2 } from "lucide-react";
import {
  INVOICE_EDO_MERGED_COLUMNS,
  computeEdoHealthSummary,
  edoHealthPercentColor,
  edoHealthStatusLabel,
  formatEdoSignedRatio,
  type InvoiceEdoMergedDocLabel,
} from "../lib/edoStatus";

type EdoHealthMonitorProps = {
  invoices: any[];
  loading?: boolean;
  onOpen?: () => void;
};

const RING_R = 14;
const RING_C = 2 * Math.PI * RING_R;

function docShortLabel(k: InvoiceEdoMergedDocLabel): string {
  return k === "СЧЕТ" ? "Сч" : k;
}

function HealthRing({ percent, alert }: { percent: number; alert: boolean }) {
  const color = edoHealthPercentColor(percent);
  const offset = RING_C - (percent / 100) * RING_C;
  return (
    <div className={`edo-health-monitor__ring${alert ? " edo-health-monitor__ring--alert" : ""}`} aria-hidden>
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={RING_R} fill="none" stroke="var(--color-border)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={offset}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="edo-health-monitor__ring-value" style={{ color }}>
        {percent}%
      </span>
    </div>
  );
}

function MicroDocBar({
  label,
  signed,
  total,
}: {
  label: string;
  signed: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
  const color = total > 0 ? edoHealthPercentColor(pct) : "var(--color-border)";
  return (
    <div className="edo-health-monitor__micro" title={`${label}: ${formatEdoSignedRatio(signed, total)}`}>
      <span className="edo-health-monitor__micro-label">{label}</span>
      <div className="edo-health-monitor__micro-track">
        <div className="edo-health-monitor__micro-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function EdoHealthMonitor({ invoices, loading, onOpen }: EdoHealthMonitorProps) {
  const summary = useMemo(() => computeEdoHealthSummary(invoices), [invoices]);

  if (!loading && (invoices?.length ?? 0) === 0) return null;

  const statusLabel = edoHealthStatusLabel(summary.percent, summary.issues);
  const alert = summary.issues > 0 || (summary.percent != null && summary.percent < 50);

  const body = (
    <>
      {loading ? (
        <Flex align="center" gap="0.5rem" className="edo-health-monitor__loading">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-primary-blue)" }} />
          <Typography.Label style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
            ЭДО…
          </Typography.Label>
        </Flex>
      ) : summary.percent != null ? (
        <>
          <HealthRing percent={summary.percent} alert={alert} />
          <div className="edo-health-monitor__meta">
            <Typography.Body className="edo-health-monitor__title">ЭДО</Typography.Body>
            <Typography.Label className="edo-health-monitor__status" style={{ color: edoHealthPercentColor(summary.percent) }}>
              {statusLabel}
            </Typography.Label>
            {(summary.pending > 0 || summary.issues > 0) && (
              <Typography.Label className="edo-health-monitor__hint">
                {summary.issues > 0 ? `${summary.issues} проблем` : `${summary.pending} ожид.`}
              </Typography.Label>
            )}
          </div>
          <div className="edo-health-monitor__bars">
            {INVOICE_EDO_MERGED_COLUMNS.map((k) => (
              <MicroDocBar
                key={k}
                label={docShortLabel(k)}
                signed={summary.byDoc[k].signed}
                total={summary.byDoc[k].total}
              />
            ))}
          </div>
        </>
      ) : null}
      {onOpen && !loading && (
        <ChevronRight className="edo-health-monitor__chevron" aria-hidden />
      )}
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        className={`edo-health-monitor cargo-card${alert ? " edo-health-monitor--alert" : ""}`}
        onClick={onOpen}
        title="Открыть монитор ЭДО в документах"
      >
        {body}
      </button>
    );
  }

  return <div className={`edo-health-monitor cargo-card${alert ? " edo-health-monitor--alert" : ""}`}>{body}</div>;
}
