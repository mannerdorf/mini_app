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

export function magistralPeriodFieldLabel(field: MagistralPeriodField): string {
  return field === "vr" ? "дате выдачи" : "дате приёмки";
}
