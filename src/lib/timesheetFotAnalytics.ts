export type TimesheetFotEmployeeRow = {
  employeeId: number;
  fullName: string;
  department: string;
  position: string;
  accrualType: "hour" | "shift" | "month";
  accrualRate: number;
  active?: boolean;
  totalHours: number;
  totalShifts: number;
  totalCost: number;
  totalPaid: number;
  totalOutstanding: number;
};

export type TimesheetFotAnalytics = {
  totalHours: number;
  totalShifts: number;
  totalCost: number;
  totalPaid: number;
  totalOutstanding: number;
  employees: TimesheetFotEmployeeRow[];
};

export type TimesheetFotDepartmentRow = {
  department: string;
  totalCost: number;
  totalPaid: number;
  totalOutstanding: number;
  totalHours: number;
  totalShifts: number;
  employeeCount: number;
  share: number;
  costPerKg: number;
};

function normalizeDashboardAccrualType(value: unknown): "hour" | "shift" | "month" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "hour";
  if (raw === "month" || raw === "месяц" || raw === "monthly") return "month";
  if (raw === "shift" || raw === "смена") return "shift";
  if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
  if (raw.includes("month") || raw.includes("месяц")) return "month";
  return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
}

function normalizeDashboardShiftMark(rawValue: string): "Я" | "ПР" | "Б" | "ОГ" | "ОТ" | "УВ" | "" {
  const raw = String(rawValue || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "Я") return "Я";
  if (raw === "ПР") return "ПР";
  if (raw === "Б") return "Б";
  if (raw === "ОГ") return "ОГ";
  if (raw === "ОТ") return "ОТ";
  if (raw === "УВ") return "УВ";
  if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE" || raw === "ON" || raw === "YES") return "Я";
  if (raw.includes("СМЕН") || raw.includes("SHIFT")) return "Я";
  return "";
}

function parseDashboardHoursValue(rawValue: string): number {
  const raw = String(rawValue || "").trim();
  if (!raw) return 0;
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const h = Number(timeMatch[1]);
    const m = Number(timeMatch[2]);
    if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
  }
  const normalized = raw.replace(/\s+/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildTimesheetFotAnalytics(data: {
  employees?: unknown[];
  entries?: Record<string, string>;
  payoutsByEmployee?: Record<string, number>;
  shiftRateOverrides?: Record<string, number>;
}): TimesheetFotAnalytics {
  const employees = Array.isArray(data?.employees) ? data.employees : [];
  const entriesRaw = data?.entries && typeof data.entries === "object" ? (data.entries as Record<string, string>) : {};
  const payoutsByEmployeeRaw =
    data?.payoutsByEmployee && typeof data.payoutsByEmployee === "object"
      ? (data.payoutsByEmployee as Record<string, number>)
      : {};
  const shiftRateOverridesRaw =
    data?.shiftRateOverrides && typeof data.shiftRateOverrides === "object"
      ? (data.shiftRateOverrides as Record<string, number>)
      : {};

  const employeeRows = employees
    .map((row: any) => ({
      employeeId: Number(row?.id || 0),
      fullName: String(row?.fullName || ""),
      department: String(row?.department || ""),
      position: String(row?.position || ""),
      accrualType: normalizeDashboardAccrualType(row?.accrualType),
      accrualRate: Number(row?.accrualRate || 0),
      active: row?.active !== false,
    }))
    .filter((x) => Number.isFinite(x.employeeId) && x.employeeId > 0);

  const entriesByEmployee = new Map<number, Array<{ date: string; value: string }>>();
  for (const [entryKey, entryValue] of Object.entries(entriesRaw)) {
    const match = /^(\d+)__(\d{4}-\d{2}-\d{2})$/.exec(entryKey);
    if (!match) continue;
    const employeeId = Number(match[1]);
    const dateIso = match[2];
    if (!Number.isFinite(employeeId) || employeeId <= 0) continue;
    const list = entriesByEmployee.get(employeeId) || [];
    list.push({ date: dateIso, value: String(entryValue || "") });
    entriesByEmployee.set(employeeId, list);
  }

  let totalHours = 0;
  let totalShifts = 0;
  let totalCost = 0;
  let totalPaid = 0;

  const employeeStats = employeeRows.map((employee) => {
    const values = entriesByEmployee.get(employee.employeeId) || [];
    const hasShiftMarks = values.some((v) => normalizeDashboardShiftMark(v.value) !== "");
    const hasNumericHours = values.some((v) => parseDashboardHoursValue(v.value) > 0);
    const resolvedAccrualType: "hour" | "shift" | "month" =
      employee.accrualType === "month"
        ? "month"
        : employee.accrualType === "shift" || (hasShiftMarks && !hasNumericHours)
          ? "shift"
          : "hour";
    let employeeShifts = 0;
    let employeeHours = 0;
    let employeeCost = 0;
    if (resolvedAccrualType === "shift" || resolvedAccrualType === "month") {
      employeeShifts = values.reduce((acc, v) => acc + (normalizeDashboardShiftMark(v.value) === "Я" ? 1 : 0), 0);
      employeeHours = employeeShifts * 8;
      employeeCost = values.reduce((acc, v) => {
        if (normalizeDashboardShiftMark(v.value) !== "Я") return acc;
        const overrideKey = `${employee.employeeId}__${v.date}`;
        const overrideRate = Number(shiftRateOverridesRaw[overrideKey]);
        const baseRate = Number(employee.accrualRate || 0);
        const dayRate =
          resolvedAccrualType === "month" ? baseRate / 21 : Number.isFinite(overrideRate) ? overrideRate : baseRate;
        return acc + dayRate;
      }, 0);
    } else {
      employeeHours = values.reduce((acc, v) => acc + parseDashboardHoursValue(v.value), 0);
      employeeCost = employeeHours * Number(employee.accrualRate || 0);
    }
    const employeePaid = Number(payoutsByEmployeeRaw[String(employee.employeeId)] || 0);
    const employeeOutstanding = Math.max(0, Number((employeeCost - employeePaid).toFixed(2)));
    totalHours += employeeHours;
    totalShifts += employeeShifts;
    totalCost += employeeCost;
    totalPaid += employeePaid;
    return {
      ...employee,
      totalHours: Number(employeeHours.toFixed(2)),
      totalShifts: Number(employeeShifts || 0),
      totalCost: Number(employeeCost.toFixed(2)),
      totalPaid: Number(employeePaid.toFixed(2)),
      totalOutstanding: employeeOutstanding,
    };
  });

  return {
    totalHours: Number(totalHours.toFixed(2)),
    totalShifts: Number(totalShifts || 0),
    totalCost: Number(totalCost.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalOutstanding: Math.max(0, Number((totalCost - totalPaid).toFixed(2))),
    employees: employeeStats,
  };
}

export function groupTimesheetFotByDepartment(
  analytics: TimesheetFotAnalytics,
  paidWeight: number,
): TimesheetFotDepartmentRow[] {
  const grouped = new Map<
    string,
    Omit<TimesheetFotDepartmentRow, "share" | "costPerKg">
  >();
  for (const row of analytics.employees) {
    const department = String(row.department || "").trim() || "Без подразделения";
    const current = grouped.get(department) || {
      department,
      totalCost: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      totalHours: 0,
      totalShifts: 0,
      employeeCount: 0,
    };
    current.totalCost += Number(row.totalCost || 0);
    current.totalPaid += Number(row.totalPaid || 0);
    current.totalOutstanding += Number(row.totalOutstanding || 0);
    current.totalHours += Number(row.totalHours || 0);
    current.totalShifts += Number(row.totalShifts || 0);
    current.employeeCount += 1;
    grouped.set(department, current);
  }
  const totalCost = analytics.totalCost;
  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      share: totalCost > 0 ? (row.totalCost / totalCost) * 100 : 0,
      costPerKg: paidWeight > 0 ? row.totalCost / paidWeight : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

export function monthDateRange(year: number, month: number): { dateFrom: string; dateTo: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    dateFrom: `${year}-${String(month).padStart(2, "0")}-01`,
    dateTo: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function monthKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Текущий календарный месяц — ещё не завершён (данные частичные). */
export function isCurrentIncompleteMonth(year: number, month: number, now: Date = new Date()): boolean {
  return year === now.getFullYear() && month === now.getMonth() + 1;
}

/** Месяцы года для загрузки (включая текущий неполный — для таблицы). */
export function monthsToFetchInYear(year: number, now: Date = new Date()): number[] {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return Array.from({ length: 12 }, (_, i) => i + 1);
  if (year > currentYear) return [];
  return Array.from({ length: currentMonth }, (_, i) => i + 1);
}

/** Завершённые месяцы года (без текущего неполного — для графиков и годовых KPI). */
export function completedMonthsInYear(year: number, now: Date = new Date()): number[] {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return Array.from({ length: 12 }, (_, i) => i + 1);
  if (year > currentYear) return [];
  if (currentMonth <= 1) return [];
  return Array.from({ length: currentMonth - 1 }, (_, i) => i + 1);
}
