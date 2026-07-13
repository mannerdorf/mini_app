export type User = {
  id: number;
  login: string;
  inn: string;
  company_name: string;
  permissions: Record<string, boolean>;
  financial_access: boolean;
  access_all_inns?: boolean;
  active: boolean;
  created_at: string;
  last_login_at?: string | null;
  companies?: { inn: string; name: string }[];
};

export type EmployeeDirectoryRow = {
  id: number;
  login: string;
  full_name: string;
  department: string;
  position: string;
  accrual_type: "hour" | "shift" | "month" | null;
  accrual_rate: number | null;
  cooperation_type: "self_employed" | "ip" | "staff" | null;
  employee_role: "employee" | "department_head";
  active: boolean;
  invited_with_preset_label: string | null;
  created_at: string;
};

export type EmployeeRateHistoryRow = {
  id: number;
  effective_from: string;
  accrual_rate: number;
  created_at: string;
};

export type AccrualType = "hour" | "shift" | "month";

/** Fallback при пустом справочнике подразделений */
export const EMPLOYEE_DEPARTMENTS_FALLBACK = [
  "Склад Москва",
  "Склад Калининград",
  "Отдел продаж",
  "Управляющая компания",
];

export const COOPERATION_TYPE_OPTIONS = [
  { value: "self_employed", label: "Самозанятость" },
  { value: "ip", label: "ИП" },
  { value: "staff", label: "Штатный сотрудник" },
] as const;

export type CooperationType = (typeof COOPERATION_TYPE_OPTIONS)[number]["value"];

export const WORK_DAYS_IN_MONTH = 21;

export function todayIsoDateMoscow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const normalizeCooperationType = (value: unknown): CooperationType => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "self_employed" || raw === "self-employed" || raw.includes("самозан")) return "self_employed";
  if (raw === "ip" || raw.includes("ип")) return "ip";
  return "staff";
};

export const cooperationTypeLabel = (value: unknown) =>
  COOPERATION_TYPE_OPTIONS.find((x) => x.value === normalizeCooperationType(value))?.label || "Штатный сотрудник";

export const normalizeAccrualType = (value: unknown): AccrualType => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "month" || raw === "месяц" || raw === "monthly" || raw.includes("month") || raw.includes("месяц")) return "month";
  if (raw === "shift" || raw === "смена" || raw.includes("shift") || raw.includes("смен")) return "shift";
  return "hour";
};

export const isShiftAccrualType = (value: unknown) => normalizeAccrualType(value) === "shift";

export const isMarkAccrualType = (value: unknown) => {
  const accrualType = normalizeAccrualType(value);
  return accrualType === "shift" || accrualType === "month";
};

export const getDayRateByAccrualType = (rate: number, accrualType: AccrualType) => {
  return accrualType === "month" ? rate / WORK_DAYS_IN_MONTH : rate;
};

export const calcMonthlyByRate = (rateRaw: string, accrualType: AccrualType): number => {
  const rate = Number(String(rateRaw || "").replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0) return 0;
  if (accrualType === "month") return rate;
  return accrualType === "shift" ? rate * WORK_DAYS_IN_MONTH : rate * 8 * WORK_DAYS_IN_MONTH;
};

export type ShiftMarkCode = "Я" | "ПР" | "Б" | "В" | "ОГ" | "ОТ" | "УВ";

export const normalizeShiftMark = (rawValue: string): ShiftMarkCode | "" => {
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
};

export const parseTimesheetHoursValue = (rawValue: string): number => {
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
};
