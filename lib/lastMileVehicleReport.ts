import { cityToCode } from "./cityToCode.js";
import { extractCargoLastMileMeta, hasCargoLastMileMeta, plateWithoutRegion } from "./cargoLastMileMeta.js";

const MSK_KGD_SELF_PICKUP_RECEIVER_ID = "d5d52d44-c5d9-11f0-9e9d-0cc47a39bad5";
const KGD_MSK_SELF_PICKUP_RECEIVER_ID = "419df7bb-4874-11f1-9e9f-0cc47a39bad5";

const TIMELINE_KEYS = ["Statuses", "statuses", "Статусы", "статусы", "Steps", "stages", "History", "history"];

function normalizePzvText(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function cargoLastMileIsSelfPickup(item: Record<string, unknown>): boolean {
  const receiverId = String(item.PZV_Receiver_Id ?? "").trim().toLowerCase();
  const pzvReceiver = normalizePzvText(item.PZV_Receiver);
  const from = cityToCode(item.CitySender);
  const to = cityToCode(item.CityReceiver);
  if (from === "MSK" && to === "KGD") {
    return receiverId === MSK_KGD_SELF_PICKUP_RECEIVER_ID || pzvReceiver.includes("железнодорожная");
  }
  if (from === "KGD" && to === "MSK") {
    return receiverId === KGD_MSK_SELF_PICKUP_RECEIVER_ID || pzvReceiver.includes("андреевское");
  }
  return false;
}

function normalizeStageKey(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, "").toLowerCase();
}

function isScheduledStage(key: string): boolean {
  return /запланирован|поставленанадоставку|вместеприбытия|готовквыдаче|квыдаче/.test(key);
}

function isDeliveredStage(key: string): boolean {
  return /доставлен|заверш/.test(key);
}

function isDeliveringStage(key: string): boolean {
  return /доставке/.test(key) && !isDeliveredStage(key);
}

export function parseCargoDateTime(raw: unknown): Date | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractTimelineArray(item: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of TIMELINE_KEYS) {
    const val = item[key];
    if (Array.isArray(val) && val.length > 0) return val as Record<string, unknown>[];
  }
  for (const nest of ["Response", "Data", "Result", "result", "data"]) {
    const nested = item[nest];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    for (const key of TIMELINE_KEYS) {
      const val = (nested as Record<string, unknown>)[key];
      if (Array.isArray(val) && val.length > 0) return val as Record<string, unknown>[];
    }
  }
  return [];
}

export function extractLastMileTimelineMoments(item: Record<string, unknown>): {
  scheduledAt: Date | null;
  deliveredAt: Date | null;
} {
  let scheduledAt: Date | null = null;
  let deliveredAt: Date | null = null;

  for (const step of extractTimelineArray(item)) {
    const key = normalizeStageKey(step.Stage ?? step.stage ?? step.Status ?? step.status ?? step.Name);
    const at = parseCargoDateTime(step.Date ?? step.date ?? step.DateVr);
    if (!at || !key) continue;
    if (isScheduledStage(key) || isDeliveringStage(key)) {
      if (!scheduledAt || at.getTime() > scheduledAt.getTime()) scheduledAt = at;
    }
    if (isDeliveredStage(key)) {
      if (!deliveredAt || at.getTime() > deliveredAt.getTime()) deliveredAt = at;
    }
  }

  if (!deliveredAt) {
    deliveredAt = parseCargoDateTime(item.DateVr ?? item.dateVr);
  }
  if (!scheduledAt) {
    const stateKey = normalizeStageKey(item.State ?? item.state);
    if (isScheduledStage(stateKey) || isDeliveringStage(stateKey) || isDeliveredStage(stateKey)) {
      scheduledAt =
        parseCargoDateTime(item.DateArrival ?? item.DateDeliveryPlan ?? item.PlannedDeliveryDate) ?? deliveredAt;
    }
  }

  return { scheduledAt, deliveredAt };
}

function parseAmount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const num = typeof raw === "string" ? parseFloat(raw.replace(",", ".")) : Number(raw);
  return Number.isFinite(num) ? num : 0;
}

export type LastMileTripRow = {
  cargoNumber: string;
  receiver: string;
  cityReceiver: string;
  scheduledAt: string | null;
  deliveredAt: string | null;
  pw: number;
  weight: number;
  volume: number;
  places: number;
};

export type LastMileVehicleDayRow = {
  date: string;
  vehicleKey: string;
  autoReg: string;
  autoType: string;
  driver: string;
  driverTel: string;
  firstAt: string | null;
  lastAt: string | null;
  workMinutes: number | null;
  trips: LastMileTripRow[];
  totals: {
    tripCount: number;
    pw: number;
    weight: number;
    volume: number;
    places: number;
  };
};

export type LastMileVehicleReport = {
  dateFrom: string;
  dateTo: string;
  rows: LastMileVehicleDayRow[];
  summary: {
    vehicleDays: number;
    tripCount: number;
    pw: number;
    weight: number;
    volume: number;
    places: number;
  };
};

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function formatTime(d: Date | null): string | null {
  if (!d) return null;
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && !String(d.toISOString()).includes("T")) {
    return null;
  }
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function hasTimePart(d: Date): boolean {
  return d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
}

function vehicleKeyFromMeta(meta: ReturnType<typeof extractCargoLastMileMeta>): string {
  if (meta.autoReg) return meta.autoReg;
  if (meta.driver) return meta.driver;
  return "—";
}

export function buildLastMileVehicleReport(
  items: Record<string, unknown>[],
  dateFrom: string,
  dateTo: string,
): LastMileVehicleReport {
  type AccTrip = LastMileTripRow & { firstCandidate: Date | null; lastCandidate: Date | null };
  const grouped = new Map<
    string,
    {
      date: string;
      vehicleKey: string;
      autoReg: string;
      autoType: string;
      driver: string;
      driverTel: string;
      trips: AccTrip[];
    }
  >();

  for (const item of items) {
    if (cargoLastMileIsSelfPickup(item)) continue;
    if (!hasCargoLastMileMeta(item)) continue;

    const { scheduledAt, deliveredAt } = extractLastMileTimelineMoments(item);
    const activityAt = deliveredAt ?? scheduledAt;
    if (!activityAt) continue;

    const workDate = toYmd(activityAt);
    if (workDate < dateFrom || workDate > dateTo) continue;

    const meta = extractCargoLastMileMeta(item);
    const vehicleKey = vehicleKeyFromMeta(meta);
    const groupKey = `${workDate}__${vehicleKey}__${meta.driver || ""}`;

    const trip: AccTrip = {
      cargoNumber: String(item.Number ?? item.number ?? "").trim() || "—",
      receiver: String(item.Receiver ?? item.receiver ?? "").trim() || "—",
      cityReceiver: String(item.CityReceiver ?? item.cityReceiver ?? "").trim() || "—",
      scheduledAt: isoOrNull(scheduledAt),
      deliveredAt: isoOrNull(deliveredAt),
      pw: parseAmount(item.PW ?? item.pw),
      weight: parseAmount(item.W ?? item.w),
      volume: parseAmount(item.Value ?? item.value),
      places: parseAmount(item.Mest ?? item.mest),
      firstCandidate: scheduledAt ?? deliveredAt,
      lastCandidate: deliveredAt ?? scheduledAt,
    };

    const current = grouped.get(groupKey) ?? {
      date: workDate,
      vehicleKey,
      autoReg: meta.autoReg || "—",
      autoType: meta.autoType || "—",
      driver: meta.driver || "—",
      driverTel: meta.driverTel || "—",
      trips: [],
    };
    current.trips.push(trip);
    grouped.set(groupKey, current);
  }

  const rows: LastMileVehicleDayRow[] = Array.from(grouped.values()).map((group) => {
    const moments = group.trips.flatMap((t) => [t.firstCandidate, t.lastCandidate].filter(Boolean)) as Date[];
    moments.sort((a, b) => a.getTime() - b.getTime());
    const first = moments[0] ?? null;
    const last = moments[moments.length - 1] ?? null;
    let workMinutes: number | null = null;
    if (first && last && hasTimePart(first) && hasTimePart(last)) {
      workMinutes = Math.max(0, Math.round((last.getTime() - first.getTime()) / 60_000));
    }

    const totals = group.trips.reduce(
      (acc, t) => {
        acc.tripCount += 1;
        acc.pw += t.pw;
        acc.weight += t.weight;
        acc.volume += t.volume;
        acc.places += t.places;
        return acc;
      },
      { tripCount: 0, pw: 0, weight: 0, volume: 0, places: 0 },
    );

    return {
      date: group.date,
      vehicleKey: group.vehicleKey,
      autoReg: group.autoReg,
      autoType: group.autoType,
      driver: group.driver,
      driverTel: group.driverTel,
      firstAt: formatTime(first),
      lastAt: formatTime(last),
      workMinutes,
      trips: group.trips.map(({ firstCandidate: _f, lastCandidate: _l, ...rest }) => rest),
      totals,
    };
  });

  rows.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.totals.pw - a.totals.pw;
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc.vehicleDays += 1;
      acc.tripCount += row.totals.tripCount;
      acc.pw += row.totals.pw;
      acc.weight += row.totals.weight;
      acc.volume += row.totals.volume;
      acc.places += row.totals.places;
      return acc;
    },
    { vehicleDays: 0, tripCount: 0, pw: 0, weight: 0, volume: 0, places: 0 },
  );

  return {
    dateFrom,
    dateTo,
    rows,
    summary: {
      ...summary,
      pw: Number(summary.pw.toFixed(2)),
      weight: Number(summary.weight.toFixed(2)),
      volume: Number(summary.volume.toFixed(3)),
      places: Number(summary.places.toFixed(0)),
    },
  };
}
