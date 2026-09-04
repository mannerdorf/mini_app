import { cityToCode } from "./cityToCode.js";
import { normalizePerevozkaSteps } from "../api/lib/postbGetapiNormalize.js";
import { calcTransitHours, parseDateTimeValue } from "./transitDateTime.js";

export const CARGO_TIMELINE_NORM_HOURS = 24;

const TIMELINE_KEYS = [
  "items",
  "Items",
  "Steps",
  "stages",
  "Statuses",
  "statuses",
  "Статусы",
  "статусы",
  "History",
  "history",
] as const;

const TIMELINE_NEST_KEYS = ["Response", "Data", "Result", "result", "data"];

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

function normalizeStageKey(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

export function mapCargoTimelineStageLabel(raw: string, item: Record<string, unknown>): string {
  const key = normalizeStageKey(raw);
  const from = cityToCode(item.CitySender as string) || "—";
  const to = cityToCode(item.CityReceiver as string) || "—";
  if (/полученаинформация|получена\s*информация/.test(key)) return "Получена информация";
  if (/полученаотзаказчика|получена\s*от\s*заказчика/.test(key)) return `Получена в ${from}`;
  if (/полученанаскладе|получена\s*на\s*складе/.test(key)) return `Получена в ${from}`;
  if (/упакована/.test(key)) return "Измерена";
  if (/консолидация/.test(key)) return "Консолидация";
  if (/отправленаваэропорт|отправлена\s*в\s*аэропорт|загружена/.test(key)) return "Загружена в ТС";
  if (/улетела/.test(key)) return "Отправлена";
  if (/квручению|к\s*вручению/.test(key)) return `Прибыла в ${to}`;
  if (/поставленанадоставку|поставлена\s*на\s*доставку|в\s*месте\s*прибытия/.test(key)) return "Запланирована доставка";
  if (/доставлена/.test(key)) return "Доставлена";
  return raw.trim();
}

function isMeaningfulStepLabel(label: string): boolean {
  const t = String(label ?? "").trim();
  return t !== "" && t !== "—" && t !== "-";
}

function sortTimelineSteps(steps: CargoTimelineStep[], item: Record<string, unknown>): CargoTimelineStep[] {
  const fromCity = cityToCode(item.CitySender as string) || "—";
  const toCity = cityToCode(item.CityReceiver as string) || "—";
  const senderLabel = `Получена в ${fromCity}`;
  const arrivedAtDestLabel = `Прибыла в ${toCity}`;
  const orderOf = (l: string, i: number): number => {
    if (l === "Получена информация") return 1;
    if (l === senderLabel) return 2;
    if (l === "Измерена") return 3;
    if (l === "Консолидация") return 4;
    if (l === "Загружена в ТС") return 5;
    if (l === "Отправлена") return 6;
    if (l === arrivedAtDestLabel) return 7;
    if (l === "Запланирована доставка") return 8;
    if (l === "Доставлена") return 9;
    return 10 + i;
  };
  return steps
    .map((s, i) => ({ s, key: orderOf(s.label, i) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.s);
}

function mapRawElementsToSteps(raw: unknown[], item: Record<string, unknown>): CargoTimelineStep[] {
  return raw.map((el: any) => {
    const rawLabel = el?.Stage ?? el?.Name ?? el?.Status ?? el?.label ?? el?.title ?? String(el);
    const labelStr = typeof rawLabel === "string" ? rawLabel : String(rawLabel);
    const dateRaw = el?.Date ?? el?.date ?? el?.DatePrih ?? el?.DateVr ?? null;
    const date = dateRaw != null && String(dateRaw).trim() ? String(dateRaw).trim() : null;
    return {
      label: mapCargoTimelineStageLabel(labelStr, item),
      date,
    };
  });
}

function extractRawTimelineArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  for (const key of TIMELINE_KEYS) {
    const val = record[key];
    if (Array.isArray(val) && val.length > 0) return val;
  }
  for (const nest of TIMELINE_NEST_KEYS) {
    const nested = record[nest];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    for (const key of TIMELINE_KEYS) {
      const val = (nested as Record<string, unknown>)[key];
      if (Array.isArray(val) && val.length > 0) return val;
    }
  }
  return [];
}

export function resolveCargoTimelineSteps(data: unknown, item: Record<string, unknown>): CargoTimelineStep[] {
  const raw = extractRawTimelineArray(data);
  let sorted = sortTimelineSteps(
    raw.length > 0 ? mapRawElementsToSteps(raw, item) : [],
    item,
  );
  if (sorted.length === 0) {
    const normalized = normalizePerevozkaSteps(data)
      .map((s) => ({
        label: mapCargoTimelineStageLabel(s.title, item),
        date: s.date || null,
      }))
      .filter((s) => isMeaningfulStepLabel(s.label));
    if (normalized.length > 1) sorted = sortTimelineSteps(normalized, item);
  }
  return sorted.filter((s) => isMeaningfulStepLabel(s.label));
}

function pickCargoNumber(item: Record<string, unknown>): string {
  return String(item.Number ?? item.number ?? item.Номер ?? item.НомерПеревозки ?? "").trim();
}

function pickCustomer(item: Record<string, unknown>): string {
  return String(item.Customer ?? item.customer ?? item.Sender ?? item.sender ?? "").trim() || "—";
}

function pickDatePrih(item: Record<string, unknown>): string {
  const raw = item.DatePrih ?? item.datePrih ?? item.Date ?? item.date ?? "";
  const parsed = parseDateTimeValue(raw);
  return parsed ? parsed.toISOString().split("T")[0]! : "";
}

function buildRouteLabel(item: Record<string, unknown>): string {
  const from = cityToCode(item.CitySender as string) || "—";
  const to = cityToCode(item.CityReceiver as string) || "—";
  return `${from} – ${to}`;
}

function receivedStageLabel(item: Record<string, unknown>): string {
  return `Получена в ${cityToCode(item.CitySender as string) || "—"}`;
}

function arrivedStageLabel(item: Record<string, unknown>): string {
  return `Прибыла в ${cityToCode(item.CityReceiver as string) || "—"}`;
}

function findStepByLabel(steps: CargoTimelineStep[], label: string): CargoTimelineStep | undefined {
  return steps.find((s) => s.label === label);
}

function findReceivedStep(steps: CargoTimelineStep[], item: Record<string, unknown>): CargoTimelineStep | undefined {
  return (
    findStepByLabel(steps, receivedStageLabel(item)) ??
    findStepByLabel(steps, "Получена информация") ??
    steps.find((s) => s.label.startsWith("Получена в "))
  );
}

function hoursBetweenSteps(from: CargoTimelineStep | undefined, to: CargoTimelineStep | undefined): number | null {
  if (!from?.date || !to?.date) return null;
  const start = parseDateTimeValue(from.date);
  const end = parseDateTimeValue(to.date);
  if (!start || !end) return null;
  return calcTransitHours(start, end);
}

function roundDays(hours: number): number {
  return Math.round((hours / 24) * 10) / 10;
}

function isLoadingGapPair(fromLabel: string, toLabel: string, item: Record<string, unknown>): boolean {
  const received = receivedStageLabel(item);
  return (
    (fromLabel === received || fromLabel === "Получена информация" || fromLabel.startsWith("Получена в ")) &&
    toLabel === "Загружена в ТС"
  );
}

function isDeliveryGapPair(fromLabel: string, toLabel: string, item: Record<string, unknown>): boolean {
  return fromLabel === arrivedStageLabel(item) && toLabel === "Доставлена";
}

export function buildCargoTimelineStageGaps(
  steps: CargoTimelineStep[],
  item: Record<string, unknown>,
  normHours = CARGO_TIMELINE_NORM_HOURS,
): CargoTimelineStageGap[] {
  const gaps: CargoTimelineStageGap[] = [];
  for (let i = 0; i < steps.length - 1; i += 1) {
    const from = steps[i]!;
    const to = steps[i + 1]!;
    const hours = hoursBetweenSteps(from, to);
    if (hours == null) continue;
    let overdueKind: CargoTimelineStageGap["overdueKind"] = null;
    if (isLoadingGapPair(from.label, to.label, item)) overdueKind = "loading";
    if (isDeliveryGapPair(from.label, to.label, item)) overdueKind = "delivery";
    gaps.push({
      fromLabel: from.label,
      toLabel: to.label,
      hours,
      days: roundDays(hours),
      overdue: overdueKind != null && hours > normHours,
      overdueKind,
    });
  }
  return gaps;
}

export function buildCargoTimelineReportRow(
  item: Record<string, unknown>,
  stepsInput: CargoTimelineStep[],
  timelineSource: CargoTimelineReportRow["timelineSource"],
  normHours = CARGO_TIMELINE_NORM_HOURS,
): CargoTimelineReportRow | null {
  const steps = sortTimelineSteps(
    stepsInput.filter((s) => s.date),
    item,
  );
  if (steps.length < 2) return null;

  const gaps = buildCargoTimelineStageGaps(steps, item, normHours);
  const received = findReceivedStep(steps, item);
  const loaded = findStepByLabel(steps, "Загружена в ТС");
  const arrived = findStepByLabel(steps, arrivedStageLabel(item));
  const delivered = findStepByLabel(steps, "Доставлена");

  const loadingGapHours = hoursBetweenSteps(received, loaded);
  const deliveryGapHours = hoursBetweenSteps(arrived, delivered);

  return {
    cargoNumber: pickCargoNumber(item),
    customer: pickCustomer(item),
    route: buildRouteLabel(item),
    datePrih: pickDatePrih(item),
    steps,
    gaps,
    loadingGapHours,
    deliveryGapHours,
    loadingOverdue: loadingGapHours != null && loadingGapHours > normHours,
    deliveryOverdue: deliveryGapHours != null && deliveryGapHours > normHours,
    timelineSource,
  };
}

export function filterCargoTimelineRowsByDelay(
  rows: CargoTimelineReportRow[],
  delayFilter: CargoTimelineDelayFilter,
): CargoTimelineReportRow[] {
  if (delayFilter === "loading") return rows.filter((r) => r.loadingOverdue);
  if (delayFilter === "delivery") return rows.filter((r) => r.deliveryOverdue);
  return rows;
}

export function summarizeCargoTimelineReport(rows: CargoTimelineReportRow[]): CargoTimelineReportSummary {
  return {
    total: rows.length,
    withTimeline: rows.filter((r) => r.steps.length >= 2).length,
    loadingOverdue: rows.filter((r) => r.loadingOverdue).length,
    deliveryOverdue: rows.filter((r) => r.deliveryOverdue).length,
  };
}

export function matchesCargoRouteFilter(
  item: Record<string, unknown>,
  routeFilter: "all" | "MSK-KGD" | "KGD-MSK",
): boolean {
  if (routeFilter === "all") return true;
  const from = cityToCode(item.CitySender as string);
  const to = cityToCode(item.CityReceiver as string);
  if (routeFilter === "MSK-KGD") return from === "MSK" && to === "KGD";
  if (routeFilter === "KGD-MSK") return from === "KGD" && to === "MSK";
  return true;
}

export function formatTimelineGapHours(hours: number | null): string {
  if (hours == null) return "—";
  const days = roundDays(hours);
  const roundedHours = Math.round(hours);
  return `${days} д (${roundedHours} ч)`;
}
