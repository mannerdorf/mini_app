import {
  AIR_PLAN_DAYS,
  AUTO_PLAN_DAYS,
  FERRY_PLAN_DAYS,
} from "./cargoUtils";
import {
  CARGO_TRANSPORT_TYPE_COLORS,
  CARGO_TRANSPORT_TYPE_LABELS,
  type CargoTransportType,
} from "./cargoTransportType";
import { getSendingRowTransportMode } from "./sendingsTransportMode";
import { resolveMetricsTransitHours } from "./transitDateTime";
import {
  matchesRouteFilterSet,
  routeCargoLabelToKey,
  type RouteFilterKey,
} from "./sharedListFilters";

export type SendingItem = Record<string, unknown>;

export type SendingsTypeStats = {
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

export type SendingsAnalysisResult = {
  byType: SendingsTypeStats[];
  completedCount: number;
  skippedIncomplete: number;
  scaleMaxDays: number;
};

export type SendingsDetailRow = {
  sendingNumber: string;
  vehicle: string;
  dateDeparture: string;
  dateReady: string;
  transitDays: number;
  transitHours: number;
  route: string;
};

export type SendingsWithinDaysBucket = {
  day: number;
  percent: number;
  count: number;
};

export type SendingsWithinDaysByType = {
  type: CargoTransportType;
  label: string;
  color: string;
  total: number;
  buckets: SendingsWithinDaysBucket[];
};

export type SendingsWithinDaysResult = {
  byType: SendingsWithinDaysByType[];
};

const SENDINGS_TYPES: CargoTransportType[] = ["auto", "ferry", "air"];

const PLAN_DAYS_BY_TYPE: Record<CargoTransportType, number> = {
  auto: AUTO_PLAN_DAYS,
  ferry: FERRY_PLAN_DAYS,
  air: AIR_PLAN_DAYS,
};

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function sendingsTransitHoursToDays(hours: number): number {
  return Math.round((hours / 24) * 10) / 10;
}

export function pickSendingNumber(item: SendingItem): string {
  const candidates = [
    item.SendingNumber,
    item.sendingNumber,
    item.NumberSend,
    item.NumberSending,
    item.НомерОтправки,
    item.НомерОтправления,
    item.НомерОтпр,
    item.Номер,
    item.Number,
    item.number,
    item.ИДОтправления,
    item.ID,
    item.Id,
    item.id,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function getSendingVehicleLabel(item: SendingItem): string {
  return String(item.АвтомобильCMRНаименование ?? item.AutoReg ?? item.AutoType ?? "").trim() || "—";
}

export function getSendingRouteLabel(item: SendingItem): string {
  const from = String(
    item.ПунктОтправленияГородАэропорт ?? item.CitySender ?? item.ГородОтправления ?? "",
  ).trim();
  const to = String(
    item.ПунктНазначенияГородАэропорт ?? item.CityReceiver ?? item.ГородНазначения ?? "",
  ).trim();
  if (!from && !to) return "—";
  return `${from || "—"} – ${to || "—"}`;
}

export function getSendingsTransportType(item: SendingItem): CargoTransportType | null {
  const vehicle = getSendingVehicleLabel(item);
  if (vehicle !== "—") {
    const mode = getSendingRowTransportMode(item, vehicle);
    if (mode === "auto" || mode === "ferry" || mode === "air") return mode;
  }
  const mode = getSendingRowTransportMode(item, "");
  return mode === "auto" || mode === "ferry" || mode === "air" ? mode : null;
}

/** Часы в пути отправки: только завершённые (есть first_ready_at). */
export function getSendingsTransitHours(item: SendingItem): number | null {
  const ready = item.first_ready_at_metric ?? item.first_ready_at;
  if (!ready) return null;
  const hours = resolveMetricsTransitHours(item);
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  return Math.round(hours * 10) / 10;
}

export function getSendingsTransitDays(item: SendingItem): number | null {
  const hours = getSendingsTransitHours(item);
  if (hours == null) return null;
  return sendingsTransitHoursToDays(hours);
}

export function filterSendingsItemsByRoute(
  items: SendingItem[],
  routeFilter: "all" | RouteFilterKey,
): SendingItem[] {
  if (routeFilter === "all") return items;
  const routeFilterSet = new Set<RouteFilterKey>([routeFilter]);
  return items.filter((item) => {
    if (
      matchesRouteFilterSet(
        item.CitySender ?? item.ГородОтправления ?? item.ПунктОтправленияГородАэропорт,
        item.CityReceiver ?? item.ГородНазначения ?? item.ПунктНазначенияГородАэропорт,
        routeFilterSet,
      )
    ) {
      return true;
    }
    const key = routeCargoLabelToKey(getSendingRouteLabel(item));
    return key ? routeFilterSet.has(key) : false;
  });
}

export function buildSendingsAnalysis(items: SendingItem[]): SendingsAnalysisResult {
  const buckets: Record<CargoTransportType, number[]> = { auto: [], ferry: [], air: [] };
  let skippedIncomplete = 0;

  for (const item of items) {
    const type = getSendingsTransportType(item);
    const days = getSendingsTransitDays(item);
    if (type == null || days == null) {
      skippedIncomplete += 1;
      continue;
    }
    buckets[type].push(days);
  }

  let scaleMaxDays = 1;
  const byType = SENDINGS_TYPES.map((type) => {
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

/** Накопительный % отправок, завершённых за N дней и быстрее. */
export function buildSendingsDeliveryWithinDays(items: SendingItem[]): SendingsWithinDaysResult {
  const buckets: Record<CargoTransportType, number[]> = { auto: [], ferry: [], air: [] };

  for (const item of items) {
    const type = getSendingsTransportType(item);
    const days = getSendingsTransitDays(item);
    if (type == null || days == null) continue;
    buckets[type].push(days);
  }

  const byType = SENDINGS_TYPES.map((type) => {
    const sorted = [...buckets[type]].sort((a, b) => a - b);
    const total = sorted.length;
    const rows: SendingsWithinDaysBucket[] = [];
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

export function buildSendingsDetailRows(items: SendingItem[], type: CargoTransportType): SendingsDetailRow[] {
  const rows: SendingsDetailRow[] = [];
  for (const item of items) {
    if (getSendingsTransportType(item) !== type) continue;
    const transitHours = getSendingsTransitHours(item);
    const transitDays = transitHours == null ? null : sendingsTransitHoursToDays(transitHours);
    if (transitDays == null || transitHours == null) continue;
    rows.push({
      sendingNumber: pickSendingNumber(item) || "—",
      vehicle: getSendingVehicleLabel(item),
      dateDeparture: String(item.send_start_at_metric ?? item.send_start_at ?? "").trim(),
      dateReady: String(item.first_ready_at_metric ?? item.first_ready_at ?? "").trim(),
      transitDays,
      transitHours,
      route: getSendingRouteLabel(item),
    });
  }
  return rows.sort(
    (a, b) =>
      b.transitDays - a.transitDays ||
      a.sendingNumber.localeCompare(b.sendingNumber, "ru"),
  );
}
