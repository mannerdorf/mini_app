import {
  SHIFT_MARK_OPTIONS,
  normalizeShiftMark,
  toHalfHourValue,
} from "../../profile/departmentTimesheetHelpers";
import { parseTimesheetHoursValue, type ShiftMarkCode } from "../types/adminUsers";

export { SHIFT_MARK_OPTIONS, toHalfHourValue };
export const SHIFT_MARK_CODES = SHIFT_MARK_OPTIONS.map((x) => x.code);

export type TimesheetDayMeta = {
  iso: string;
  day: number;
  weekdayShort: string;
  isWeekend: boolean;
};

export function buildTimesheetHalfHourOptions() {
  return Array.from({ length: 49 }, (_, idx) => {
    const hours = Math.floor(idx / 2);
    const mins = idx % 2 === 0 ? "00" : "30";
    const value = (idx * 0.5).toFixed(1);
    return { value, label: `${hours}:${mins}` };
  });
}

export function buildTimesheetDays(timesheetMonth: string): TimesheetDayMeta[] {
  const [yRaw, mRaw] = (timesheetMonth || "").split("-");
  const year = Number(yRaw);
  const month = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekdayShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const out: TimesheetDayMeta[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const wd = dt.getDay();
    out.push({
      iso: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
      weekdayShort: weekdayShort[wd] ?? "",
      isWeekend: wd === 0 || wd === 6,
    });
  }
  return out;
}

export function getAdminHourlyCellMark(rawValue: string): ShiftMarkCode | "" {
  const mark = normalizeShiftMark(rawValue);
  if (mark) return mark;
  return parseTimesheetHoursValue(rawValue) > 0 ? "Я" : "В";
}

export function getAdminShiftMarkStyle(mark: ShiftMarkCode | "") {
  const option = SHIFT_MARK_OPTIONS.find((x) => x.code === mark);
  if (!option) {
    return { border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
  }
  return { border: `1px solid ${option.border}`, background: option.bg, color: option.color };
}

export function getTimesheetDepartmentLabel(emp: { department?: string | null }): string {
  const raw = String(emp.department || "").trim();
  if (!raw) return "Без подразделения";
  return raw.split(",").map((part) => part.trim()).find(Boolean) || "Без подразделения";
}
