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
