/**
 * Номер перевозки: для UI убираем ведущие нули (formatInvoiceNumber),
 * для API Getperevozka / GetFile — дополняем до 9 цифр (000139082).
 */

const CARGO_FIELD_KEYS = [
  "Number",
  "number",
  "Номер",
  "Mest",
  "mest",
  "Sender",
  "sender",
  "Customer",
  "customer",
  "Receiver",
  "receiver",
  "DatePrih",
  "datePrih",
  "State",
  "state",
  "CitySender",
  "CityReceiver",
  "W",
  "PW",
  "Sum",
  "sum",
];

export function hasPerevozkaCargoFields(obj: Record<string, unknown> | null | undefined): boolean {
  if (!obj || typeof obj !== "object") return false;
  return CARGO_FIELD_KEYS.some((key) => {
    const value = obj[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

/** 139082 → 000139082; 0000-000139082 → 000139082 */
export function formatPerevozkaNumberForApi(s: string | undefined | null): string {
  const str = String(s ?? "").trim();
  if (!str) return "";
  const withoutPrefix = str.replace(/^0000-/, "");
  const digits = withoutPrefix.replace(/\D/g, "");
  if (!digits) return str;
  const core = digits.replace(/^0+/, "") || digits;
  if (/^\d{1,9}$/.test(core)) return core.padStart(9, "0");
  if (digits.length >= 9) return digits;
  return str;
}
