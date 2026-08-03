export const WORK_DAYS_IN_MONTH = 21;

export const SHIFT_MARK_OPTIONS = [
    { code: "Я", label: "Явка", bg: "#35c46a", color: "#ffffff", border: "#1f8f45" },
    { code: "ПР", label: "Прогул", bg: "#ef4444", color: "#ffffff", border: "#dc2626" },
    { code: "Б", label: "Болезнь", bg: "#f59e0b", color: "#111827", border: "#d97706" },
    { code: "В", label: "Выходной", bg: "#94a3b8", color: "#ffffff", border: "#64748b" },
    { code: "ОГ", label: "Отгул", bg: "#8b5cf6", color: "#ffffff", border: "#7c3aed" },
    { code: "ОТ", label: "Отпуск", bg: "#3b82f6", color: "#ffffff", border: "#2563eb" },
    { code: "УВ", label: "Уволен", bg: "#6b7280", color: "#ffffff", border: "#4b5563" },
] as const;

export const SHIFT_MARK_CODES = SHIFT_MARK_OPTIONS.map((x) => x.code);
export type ShiftMarkCode = (typeof SHIFT_MARK_OPTIONS)[number]["code"];

export const COOPERATION_TYPE_OPTIONS = [
    { value: "self_employed", label: "Самозанятость" },
    { value: "ip", label: "ИП" },
    { value: "staff", label: "Штатный сотрудник" },
] as const;

export function cooperationTypeLabel(value?: string) {
    if (value === "self_employed") return "Самозанятость";
    if (value === "ip") return "ИП";
    return "Штатный сотрудник";
}

export function normalizeShiftMark(rawValue: string): ShiftMarkCode | "" {
    const raw = String(rawValue || "").trim().toUpperCase();
    if (!raw) return "";
    if (raw === "Я") return "Я";
    if (raw === "ПР") return "ПР";
    if (raw === "Б") return "Б";
    if (raw === "В") return "В";
    if (raw === "ОГ") return "ОГ";
    if (raw === "ОТ") return "ОТ";
    if (raw === "УВ") return "УВ";
    if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE") return "Я";
    return "";
}

export function getShiftMarkStyle(mark: ShiftMarkCode | "") {
    const option = SHIFT_MARK_OPTIONS.find((x) => x.code === mark);
    if (!option) {
        return { border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
    }
    return { border: `1px solid ${option.border}`, background: option.bg, color: option.color };
}

export function normalizeDepartmentAccrualType(value: unknown): "hour" | "shift" | "month" {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "hour";
    if (raw === "month" || raw === "месяц" || raw === "monthly" || raw.includes("month") || raw.includes("месяц")) return "month";
    if (raw === "shift" || raw === "смена" || raw.includes("shift") || raw.includes("смен")) return "shift";
    return "hour";
}

export function isShiftAccrual(value: string) {
    return normalizeDepartmentAccrualType(value) === "shift";
}

export function getDayRateByAccrualType(rate: number, accrualType: "hour" | "shift" | "month") {
    return accrualType === "month" ? rate / WORK_DAYS_IN_MONTH : rate;
}

export function toHalfHourValue(raw: string) {
    const parsed = Number(String(raw || "").replace(",", "."));
    if (!Number.isFinite(parsed)) return "0.0";
    const normalized = Math.max(0, Math.min(24, parsed));
    return (Math.round(normalized * 2) / 2).toFixed(1);
}

export function parseHourValue(rawValue: string): number {
    const raw = String(rawValue || "").trim();
    if (!raw) return 0;
    const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
        const h = Number(hhmm[1]);
        const m = Number(hhmm[2]);
        if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
    }
    const parsed = Number(raw.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
}

export function getHourlyCellMark(rawValue: string): ShiftMarkCode | "" {
    const mark = normalizeShiftMark(rawValue);
    if (mark) return mark;
    return parseHourValue(rawValue) > 0 ? "Я" : "В";
}
