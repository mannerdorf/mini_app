/** Дата перевозки для фильтра периода — как в api/perevozki.ts (раздел «Грузы»). */

export function normalizeCargoDateOnly(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

/** Первая доступная дата перевозки (приоритет как в кэше perevozki). */
export function cargoItemDate(item: Record<string, unknown>): string {
  const d =
    item.DatePrih ??
    item.DateVr ??
    item.DateDelivery ??
    item.DeliveryDate ??
    item.PlanDate ??
    item.PlanDeliveryDate ??
    item.DateArrival ??
    item.DateDoc ??
    item.DateOtpr ??
    item.DateShipment ??
    item.ShipmentDate ??
    "";
  return normalizeCargoDateOnly(d);
}

export function isCargoInDateRange(
  item: Record<string, unknown>,
  dateFrom: string,
  dateTo: string,
): boolean {
  const d = cargoItemDate(item);
  return !!d && d >= dateFrom && d <= dateTo;
}

/** Какой датой фильтровать период в /api/perevozki (дашборд «Выдано», SLA по DateVr). */
export type CargoDateField = "default" | "prih" | "vr";

export function cargoItemDateForField(
  item: Record<string, unknown>,
  field: CargoDateField = "default",
): string {
  if (field === "prih") {
    return normalizeCargoDateOnly(item.DatePrih);
  }
  if (field === "vr") {
    const vrCandidates = [
      item.DateVr,
      item.DateDeliveryFact,
      item.FactDeliveryDate,
      item.DateDelivery,
      item.DeliveryDate,
    ];
    for (const raw of vrCandidates) {
      const d = normalizeCargoDateOnly(raw);
      if (d) return d;
    }
    return "";
  }
  return cargoItemDate(item);
}

export function isCargoInDateRangeForField(
  item: Record<string, unknown>,
  dateFrom: string,
  dateTo: string,
  field: CargoDateField = "default",
): boolean {
  const d = cargoItemDateForField(item, field);
  return !!d && d >= dateFrom && d <= dateTo;
}

/** Поля плановой даты прибытия на терминал — как в «Документы» / карточка груза (DateArrival и др.). */
const CARGO_PLANNED_DELIVERY_KEYS = [
  "DateArrival",
  "PlannedDeliveryDate",
  "PlanDeliveryDate",
  "DateDeliveryPlan",
  "ПлановаяДатаДоставки",
  "ПланДатаДоставки",
  "ПлановаяДата",
  "PlanDate",
  "ДатаПрибытияПлан",
  "ДатаДоставкиПлан",
  "ПланДатаПрибытия",
  "ПлановаяДатаПрибытия",
  "DateVrPlan",
  "DatePrihPlan",
  "ДатаПлан",
] as const;

function isValidPlannedDateIso(iso: string): boolean {
  if (!iso || iso < "1990-01-01") return false;
  if (iso === "0001-01-01" || iso === "1900-01-01" || iso === "1901-01-01") return false;
  return true;
}

/** Ближайшая (минимальная) плановая дата прибытия на терминал по полям перевозки. */
export function cargoPlannedDeliveryDateFromItem(item: Record<string, unknown>): string {
  let earliest = "";
  for (const k of CARGO_PLANNED_DELIVERY_KEYS) {
    const d = normalizeCargoDateOnly(item[k]);
    if (!isValidPlannedDateIso(d)) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}
