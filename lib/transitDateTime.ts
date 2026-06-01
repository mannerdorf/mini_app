import { getFilterKeyByStatus } from "../src/lib/statusUtils.js";

export function parseDateTimeValue(value: unknown): Date | null {
  const source = String(value ?? "").trim();
  if (!source) return null;
  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    const hours = Number(iso[4] ?? 0);
    const minutes = Number(iso[5] ?? 0);
    const seconds = Number(iso[6] ?? 0);
    const date = new Date(year, month, day, hours, minutes, seconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const ru = source.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,T](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/);
  if (ru) {
    const day = Number(ru[1]);
    const month = Number(ru[2]) - 1;
    const year = Number(ru[3]);
    const hours = Number(ru[4] ?? 0);
    const minutes = Number(ru[5] ?? 0);
    const seconds = Number(ru[6] ?? 0);
    const date = new Date(year, month, day, hours, minutes, seconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(source);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function hasTimeComponent(value: unknown): boolean {
  const source = String(value ?? "").trim();
  if (!source) return false;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(source)) return true;
  if (/^\d{2}\.\d{2}\.\d{4}[ ,T]\d{1,2}:\d{2}/.test(source)) return true;
  return false;
}

export function pickEarliestDateTime(candidates: Array<Date | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!best || candidate.getTime() < best.getTime()) best = candidate;
  }
  return best;
}

export function calcTransitHours(start: Date, end: Date): number | null {
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
}

const SENDING_DEPARTURE_FIELDS = [
  "DateOtpr",
  "DateSend",
  "DateShipment",
  "ShipmentDate",
  "ДатаОтправки",
  "ДатаОтгрузки",
] as const;

const SENDING_DEPARTURE_FALLBACK_FIELDS = [
  ...SENDING_DEPARTURE_FIELDS,
  "DateDoc",
  "Date",
  "date",
  "Дата",
] as const;

const ROW_STATUS_DATE_FIELDS = [
  "StatusDate",
  "DateStatus",
  "DateState",
  "UpdatedAt",
  "updated_at",
  "ДатаСтатуса",
  "ДатаИзменения",
] as const;

function isDepartureLikeStatus(raw: unknown): boolean {
  const statusKey = getFilterKeyByStatus(String(raw ?? ""));
  if (statusKey === "in_transit" || statusKey === "delivering") return true;
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return false;
  return s.includes("пути") || s.includes("отправлен") || s.includes("transit") || s.includes("sent");
}

const SENDING_END_FIELDS = [
  "DatePrih",
  "DateVr",
  "DateDelivery",
  "DeliveryDate",
  "ДатаДоставки",
  "ДатаПрибытия",
] as const;

export function pickEarliestFromRowFields(
  row: Record<string, unknown>,
  fields: readonly string[],
  requireTime: boolean,
): Date | null {
  return pickFromFields(row, fields, requireTime);
}

export function pickSendingRowStopDate(row: unknown): Date | null {
  const r = row as Record<string, unknown>;
  return (
    pickFromFields(r, ROW_STATUS_DATE_FIELDS, true) ?? pickFromFields(r, ROW_STATUS_DATE_FIELDS, false)
  );
}

export function pickSendingExplicitEndDate(row: unknown): Date | null {
  const r = row as Record<string, unknown>;
  return pickFromFields(r, SENDING_END_FIELDS, true) ?? pickFromFields(r, SENDING_END_FIELDS, false);
}

function pickFromFields(
  row: Record<string, unknown>,
  fields: readonly string[],
  requireTime: boolean,
): Date | null {
  const parsed: Date[] = [];
  for (const key of fields) {
    const raw = row[key];
    if (raw == null || String(raw).trim() === "") continue;
    if (requireTime && !hasTimeComponent(raw)) continue;
    const date = parseDateTimeValue(raw);
    if (date) parsed.push(date);
  }
  return pickEarliestDateTime(parsed);
}

function pickCargoDepartureFromMap(
  cargoNumbers: string[],
  cargoDepartureByNumber: Map<string, Date>,
  normCargoKey: (num: string | null | undefined) => string,
): Date | null {
  const parsed: Date[] = [];
  cargoNumbers.forEach((cargoNumber) => {
    const key = normCargoKey(cargoNumber);
    const date = cargoDepartureByNumber.get(key) ?? cargoDepartureByNumber.get(cargoNumber);
    if (date) parsed.push(date);
  });
  return pickEarliestDateTime(parsed);
}

export function pickSendingDepartureStart(
  row: unknown,
  cargoNumbers: string[],
  cargoDepartureByNumber: Map<string, Date>,
  normCargoKey: (num: string | null | undefined) => string,
): Date | null {
  const r = row as Record<string, unknown>;
  const rowStatusRaw = r?.State ?? r?.state ?? r?.Статус ?? r?.Status ?? r?.StatusName ?? "";

  const withTime =
    pickFromFields(r, SENDING_DEPARTURE_FIELDS, true) ??
    (isDepartureLikeStatus(rowStatusRaw)
      ? pickFromFields(r, ROW_STATUS_DATE_FIELDS, true)
      : null) ??
    pickCargoDepartureFromMap(cargoNumbers, cargoDepartureByNumber, normCargoKey);

  if (withTime) return withTime;

  return pickFromFields(r, SENDING_DEPARTURE_FALLBACK_FIELDS, false);
}

export function pickCargoDepartureDate(cargo: Record<string, unknown>): Date | null {
  const statusRaw = cargo?.State ?? cargo?.state ?? cargo?.Статус ?? cargo?.Status ?? cargo?.StatusName ?? "";
  const withTime =
    pickFromFields(cargo, SENDING_DEPARTURE_FIELDS, true) ??
    (isDepartureLikeStatus(statusRaw) ? pickFromFields(cargo, ROW_STATUS_DATE_FIELDS, true) : null);
  if (withTime) return withTime;
  return pickFromFields(cargo, SENDING_DEPARTURE_FIELDS, false);
}

export function buildCargoDepartureByNumber(
  perevozkiItems: unknown[],
  normCargoKey: (num: string | null | undefined) => string,
): Map<string, Date> {
  const m = new Map<string, Date>();
  (perevozkiItems || []).forEach((item) => {
    const cargo = item as Record<string, unknown>;
    const raw = String(
      cargo?.Number ??
        cargo?.number ??
        cargo?.Номер ??
        cargo?.НомерПеревозки ??
        cargo?.CargoNumber ??
        cargo?.NumberPerevozki ??
        "",
    )
      .replace(/^0000-/, "")
      .trim();
    if (!raw) return;
    const departure = pickCargoDepartureDate(cargo);
    if (!departure) return;
    const key = normCargoKey(raw);
    const prev = m.get(key);
    if (!prev || departure.getTime() < prev.getTime()) m.set(key, departure);
    if (key !== raw) {
      const prevRaw = m.get(raw);
      if (!prevRaw || departure.getTime() < prevRaw.getTime()) m.set(raw, departure);
    }
  });
  return m;
}

export function resolveMetricsTransitHours(row: unknown, now: Date = new Date()): number | null {
  const r = row as Record<string, unknown>;
  const sendStartAt = parseDateTimeValue(r?.send_start_at_metric);
  if (!sendStartAt) {
    const stored = r?.in_transit_hours;
    if (stored != null && Number.isFinite(Number(stored))) {
      return Math.round(Number(stored) * 10) / 10;
    }
    return null;
  }
  const firstReadyAt = parseDateTimeValue(r?.first_ready_at_metric);
  const end = firstReadyAt ?? now;
  return calcTransitHours(sendStartAt, end);
}

export function liveInTransitHoursFromMetrics(
  sendStartAt: unknown,
  firstReadyAt: unknown,
  storedHours: unknown,
  now: Date = new Date(),
): number | null {
  const start = parseDateTimeValue(sendStartAt);
  if (!start) {
    if (storedHours != null && Number.isFinite(Number(storedHours))) {
      return Math.round(Number(storedHours) * 10) / 10;
    }
    return null;
  }
  const ready = parseDateTimeValue(firstReadyAt);
  const end = ready ?? now;
  return calcTransitHours(start, end);
}
