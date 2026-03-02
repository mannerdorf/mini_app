/** Вычисление суммы начисления по строке табеля. Одна логика для записи и для чтения. */
function normalizeAccrualType(value: unknown): "hour" | "shift" | "month" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "month" || raw === "месяц" || raw === "monthly") return "month";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  if (raw.includes("month") || raw.includes("месяц")) return "month";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

function normalizeShiftMark(rawValue: string): "Я" | "" {
  const raw = String(rawValue || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "Я" || raw === "С" || raw === "C" || raw === "1" || raw === "TRUE" || raw === "ON" || raw === "YES") return "Я";
  if (raw.includes("СМЕН") || raw.includes("SHIFT")) return "Я";
  return "";
}

function parseHoursValue(rawValue: string): number {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
  }
  const parsed = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Сумма по ставке из справочника. При "Я" — стоимость ставки за день/смену. */
export function computeTimesheetEntryAmount(
  accrualType: "hour" | "shift" | "month",
  accrualRate: number,
  valueText: string,
  shiftRateOverride?: number | null
): number {
  const rate = Number(accrualRate || 0);
  const mark = normalizeShiftMark(valueText);
  if (accrualType === "shift") {
    if (mark !== "Я") return 0;
    return Math.abs(Number.isFinite(Number(shiftRateOverride)) ? Number(shiftRateOverride!) : rate);
  }
  if (accrualType === "month") {
    if (mark !== "Я") return 0;
    return Math.abs(rate / 21);
  }
  const hours = parseHoursValue(valueText);
  if (hours > 0) return Math.abs(hours * rate);
  if (mark === "Я") return Math.abs(8 * rate);
  return 0;
}
