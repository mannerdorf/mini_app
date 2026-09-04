import {
  AIR_PLAN_DAYS,
  AUTO_PLAN_DAYS,
  FERRY_PLAN_DAYS,
} from "./cargoUtils";
import {
  CARGO_TRANSPORT_TYPE_COLORS,
  CARGO_TRANSPORT_TYPE_LABELS,
  getCargoTransportType,
  type CargoTransportType,
} from "./cargoTransportType";
import { getCargoItemRouteLabel } from "../components/shared/CargoTableDisplay";
import { stripOoo } from "./formatUtils";
import {
  matchesRouteFilterSet,
  routeCargoLabelToKey,
  type RouteFilterKey,
} from "./sharedListFilters";
import type { CargoItem } from "../types";

export type MagistralPeriodField = "vr" | "prih";

export type MagistralTypeStats = {
  type: CargoTransportType;
  label: string;
  color: string;
  count: number;
  minDays: number | null;
  maxDays: number | null;
  avgDays: number | null;
  medianDays: number | null;
  planDays: number;
};

export type MagistralAnalysisResult = {
  byType: MagistralTypeStats[];
  completedCount: number;
  skippedIncomplete: number;
  scaleMaxDays: number;
};

export type MagistralDetailRow = {
  cargoNumber: string;
  customer: string;
  datePrih: string;
  dateVr: string;
  transitDays: number;
  route: string;
};

export type MagistralWithinDaysBucket = {
  day: number;
  percent: number;
  count: number;
};

export type MagistralWithinDaysByType = {
  type: CargoTransportType;
  label: string;
  color: string;
  total: number;
  buckets: MagistralWithinDaysBucket[];
};

export type MagistralWithinDaysResult = {
  byType: MagistralWithinDaysByType[];
};

const MAGISTRAL_TYPES: CargoTransportType[] = ["auto", "ferry", "air"];

const PLAN_DAYS_BY_TYPE: Record<CargoTransportType, number> = {
  auto: AUTO_PLAN_DAYS,
  ferry: FERRY_PLAN_DAYS,
  air: AIR_PLAN_DAYS,
};

function parseCargoDateMs(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Календарные дни от приёмки (DatePrih) до выдачи (DateVr и аналоги). */
export function getMagistralTransitDays(item: CargoItem): number | null {
  const fromMs = parseCargoDateMs(item.DatePrih);
  const toMs = parseCargoDateMs(
    item.DateVr ??
      (item as { DateDeliveryFact?: string }).DateDeliveryFact ??
      (item as { FactDeliveryDate?: string }).FactDeliveryDate ??
      item.DateDelivery ??
      (item as { DeliveryDate?: string }).DeliveryDate,
  );
  if (fromMs == null || toMs == null) return null;
  const days = Math.round((toMs - fromMs) / 86_400_000);
  return days >= 0 ? days : null;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function filterMagistralItemsByRoute(
  items: CargoItem[],
  routeFilter: "all" | RouteFilterKey,
): CargoItem[] {
  if (routeFilter === "all") return items;
  const routeFilterSet = new Set<RouteFilterKey>([routeFilter]);
  return items.filter((item) => {
    if (matchesRouteFilterSet(item.CitySender, item.CityReceiver, routeFilterSet)) return true;
    const key = routeCargoLabelToKey(getCargoItemRouteLabel(item));
    return key ? routeFilterSet.has(key) : false;
  });
}

export function buildMagistralAnalysis(items: CargoItem[]): MagistralAnalysisResult {
  const buckets: Record<CargoTransportType, number[]> = { auto: [], ferry: [], air: [] };
  let skippedIncomplete = 0;

  for (const item of items) {
    const days = getMagistralTransitDays(item);
    if (days == null) {
      skippedIncomplete += 1;
      continue;
    }
    buckets[getCargoTransportType(item)].push(days);
  }

  let scaleMaxDays = 1;
  const byType = MAGISTRAL_TYPES.map((type) => {
    const sorted = [...buckets[type]].sort((a, b) => a - b);
    const count = sorted.length;
    if (count > 0) scaleMaxDays = Math.max(scaleMaxDays, sorted[sorted.length - 1]!);
    return {
      type,
      label: CARGO_TRANSPORT_TYPE_LABELS[type],
      color: CARGO_TRANSPORT_TYPE_COLORS[type],
      count,
      minDays: count > 0 ? sorted[0]! : null,
      maxDays: count > 0 ? sorted[sorted.length - 1]! : null,
      avgDays: average(sorted),
      medianDays: median(sorted),
      planDays: PLAN_DAYS_BY_TYPE[type],
    };
  });

  const completedCount = byType.reduce((acc, row) => acc + row.count, 0);
  scaleMaxDays = Math.max(scaleMaxDays, ...byType.map((r) => r.planDays));

  return {
    byType,
    completedCount,
    skippedIncomplete,
    scaleMaxDays,
  };
}

function countTransitDaysWithin(sortedAsc: number[], maxDay: number): number {
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid]! <= maxDay) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Накопительный % грузов, доставленных за N дней и меньше (по типу перевозки). */
export function buildMagistralDeliveryWithinDays(items: CargoItem[]): MagistralWithinDaysResult {
  const buckets: Record<CargoTransportType, number[]> = { auto: [], ferry: [], air: [] };

  for (const item of items) {
    const days = getMagistralTransitDays(item);
    if (days == null) continue;
    buckets[getCargoTransportType(item)].push(days);
  }

  const byType = MAGISTRAL_TYPES.map((type) => {
    const sorted = [...buckets[type]].sort((a, b) => a - b);
    const total = sorted.length;
    const rows: MagistralWithinDaysBucket[] = [];
    if (total === 0) {
      return {
        type,
        label: CARGO_TRANSPORT_TYPE_LABELS[type],
        color: CARGO_TRANSPORT_TYPE_COLORS[type],
        total: 0,
        buckets: rows,
      };
    }

    const maxDay = sorted[sorted.length - 1]!;
    let prevPercent = -1;
    for (let day = 1; day <= maxDay; day += 1) {
      const count = countTransitDaysWithin(sorted, day);
      const percent = Math.round((count / total) * 100);
      if (percent === 0 || percent === prevPercent) continue;
      rows.push({ day, percent, count });
      prevPercent = percent;
    }

    return {
      type,
      label: CARGO_TRANSPORT_TYPE_LABELS[type],
      color: CARGO_TRANSPORT_TYPE_COLORS[type],
      total,
      buckets: rows,
    };
  });

  return { byType };
}

/** Детальные строки перевозок по типу (для раскрытия из сводки). */
export function buildMagistralDetailRows(items: CargoItem[], type: CargoTransportType): MagistralDetailRow[] {
  const rows: MagistralDetailRow[] = [];
  for (const item of items) {
    if (getCargoTransportType(item) !== type) continue;
    const transitDays = getMagistralTransitDays(item);
    if (transitDays == null) continue;
    rows.push({
      cargoNumber: String(item.Number ?? "").trim() || "—",
      customer:
        stripOoo(String(item.Customer ?? (item as { customer?: string }).customer ?? "—")).trim() || "—",
      datePrih: String(item.DatePrih ?? "").trim(),
      dateVr: String(
        item.DateVr ??
          (item as { DateDeliveryFact?: string }).DateDeliveryFact ??
          (item as { FactDeliveryDate?: string }).FactDeliveryDate ??
          item.DateDelivery ??
          (item as { DeliveryDate?: string }).DeliveryDate ??
          "",
      ).trim(),
      transitDays,
      route: getCargoItemRouteLabel(item),
    });
  }
  return rows.sort(
    (a, b) => b.transitDays - a.transitDays || a.cargoNumber.localeCompare(b.cargoNumber, "ru"),
  );
}

export function magistralPeriodFieldLabel(field: MagistralPeriodField): string {
  return field === "vr" ? "дате выдачи" : "дате приёмки";
}
