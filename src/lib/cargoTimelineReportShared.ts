export const CARGO_TIMELINE_NORM_HOURS = 24;
/** Максимальный период запроса отчёта (календарные дни, вкл. границы). */
export const CARGO_TIMELINE_MAX_PERIOD_DAYS = 7;
export const CARGO_TIMELINE_DATE_FILTER_STORAGE_KEY = "haulz.cargoTimelineDateFilter";

export type CargoTimelineStep = {
  label: string;
  date: string | null;
};

export type CargoTimelineStageGap = {
  fromLabel: string;
  toLabel: string;
  hours: number;
  days: number;
  overdue: boolean;
  overdueKind: "loading" | "delivery" | null;
};

export type CargoTimelineReportRow = {
  cargoNumber: string;
  customer: string;
  route: string;
  datePrih: string;
  steps: CargoTimelineStep[];
  gaps: CargoTimelineStageGap[];
  loadingGapHours: number | null;
  deliveryGapHours: number | null;
  loadingOverdue: boolean;
  deliveryOverdue: boolean;
  timelineSource: "embedded" | "fetched" | "partial";
};

export type CargoTimelineDelayFilter = "all" | "loading" | "delivery";

export type CargoTimelineReportSummary = {
  total: number;
  withTimeline: number;
  loadingOverdue: number;
  deliveryOverdue: number;
};

export type CargoTimelineReport = {
  dateFrom: string;
  dateTo: string;
  summary: CargoTimelineReportSummary;
  rows: CargoTimelineReportRow[];
  truncated?: boolean;
  truncatedMessage?: string;
};

export function formatTimelineGapHours(hours: number | null): string {
  if (hours == null) return "—";
  const days = Math.round((hours / 24) * 10) / 10;
  const roundedHours = Math.round(hours);
  return `${days} д (${roundedHours} ч)`;
}
