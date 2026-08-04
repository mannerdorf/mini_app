import {
  normalizeAccrualType,
  isMarkAccrualType,
  getDayRateByAccrualType,
  normalizeShiftMark,
  parseTimesheetHoursValue,
  type EmployeeDirectoryRow,
  type ShiftMarkCode,
} from "../types/adminUsers";
import type { TimesheetDayMeta } from "./adminTimesheetHelpers";

export type TimesheetPayoutRow = {
  id: number;
  payoutDate: string;
  periodFrom: string;
  periodTo: string;
  amount: number;
  taxAmount: number;
  cooperationType: string;
  paidDates?: string[];
  createdAt: string;
};

export type TimesheetEmployeeStats = {
  accrualType: ReturnType<typeof normalizeAccrualType>;
  isShiftAccrual: boolean;
  isMarkAccrual: boolean;
  hourlyRate: number;
  totalShifts: number;
  totalHours: number;
  totalMoney: number;
  paidShifts: number;
  paidHours: number;
  totalMoneyToPay: number;
  totalPrimaryText: string;
  legendCounts: Record<string, number>;
  employeePayouts: TimesheetPayoutRow[];
  employeePaidTotal: number;
  employeeOutstanding: number;
  paidDatesSet: Set<string>;
  markedDaysCount: number;
  totalColumnCount: number;
};

type Params = {
  emp: EmployeeDirectoryRow;
  timesheetDays: TimesheetDayMeta[];
  timesheetHours: Record<string, string>;
  timesheetPaymentMarks: Record<string, boolean>;
  timesheetShiftRateOverrides: Record<string, number>;
  shiftMarkCodes: ShiftMarkCode[];
  timesheetMobilePicker: boolean;
  timesheetPayoutsByEmployee: Record<string, TimesheetPayoutRow[]>;
};

export function computeTimesheetEmployeeStats({
  emp,
  timesheetDays,
  timesheetHours,
  timesheetPaymentMarks,
  timesheetShiftRateOverrides,
  shiftMarkCodes,
  timesheetMobilePicker,
  timesheetPayoutsByEmployee,
}: Params): TimesheetEmployeeStats {
  const accrualType = normalizeAccrualType(emp.accrual_type);
  const isShiftAccrual = accrualType === "shift";
  const isMarkAccrual = isMarkAccrualType(accrualType);
  const hourlyRate = Number(emp.accrual_rate ?? 0);
  const shiftHours = 8;

  const totalShifts = timesheetDays.reduce((acc, d) => {
    const key = `${emp.id}__${d.iso}`;
    const val = timesheetHours[key] || "";
    return acc + (normalizeShiftMark(val) === "Я" ? 1 : 0);
  }, 0);

  const totalHours = isMarkAccrual
    ? totalShifts * shiftHours
    : timesheetDays.reduce((acc, d) => {
        const key = `${emp.id}__${d.iso}`;
        return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
      }, 0);

  const totalMoney = isMarkAccrual
    ? (isShiftAccrual
        ? timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
            const override = Number(timesheetShiftRateOverrides[key]);
            const dayRate = Number.isFinite(override) ? override : hourlyRate;
            return acc + dayRate;
          }, 0)
        : totalShifts * getDayRateByAccrualType(hourlyRate, accrualType))
    : totalHours * hourlyRate;

  const paidShifts = isMarkAccrual
    ? timesheetDays.reduce((acc, d) => {
        const key = `${emp.id}__${d.iso}`;
        if (!timesheetPaymentMarks[key]) return acc;
        return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
      }, 0)
    : 0;

  const paidHours = isMarkAccrual
    ? paidShifts * shiftHours
    : timesheetDays.reduce((acc, d) => {
        const key = `${emp.id}__${d.iso}`;
        if (!timesheetPaymentMarks[key]) return acc;
        return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
      }, 0);

  const totalMoneyToPay = isMarkAccrual
    ? (isShiftAccrual
        ? timesheetDays.reduce((acc, d) => {
            const key = `${emp.id}__${d.iso}`;
            if (!timesheetPaymentMarks[key]) return acc;
            if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
            const override = Number(timesheetShiftRateOverrides[key]);
            const dayRate = Number.isFinite(override) ? override : hourlyRate;
            return acc + dayRate;
          }, 0)
        : paidShifts * getDayRateByAccrualType(hourlyRate, accrualType))
    : paidHours * hourlyRate;

  const totalPrimaryText = isMarkAccrual
    ? `${totalShifts} ${timesheetMobilePicker ? "смены" : "смен"}`
    : `${Number(totalHours.toFixed(1))} ${timesheetMobilePicker ? "часы" : "ч"}`;

  const legendCounts = shiftMarkCodes.reduce<Record<string, number>>((acc, code) => {
    acc[code] = 0;
    return acc;
  }, {});
  for (const d of timesheetDays) {
    const key = `${emp.id}__${d.iso}`;
    const mark = normalizeShiftMark(timesheetHours[key] || "");
    if (mark) legendCounts[mark] = (legendCounts[mark] || 0) + 1;
  }

  const totalColumnCount = 1 + timesheetDays.length + 1 + shiftMarkCodes.length;
  const employeePayouts = timesheetPayoutsByEmployee[String(emp.id)] || [];
  const employeePaidTotal = employeePayouts.reduce((acc, payout) => acc + Number(payout.amount || 0), 0);
  const employeeOutstanding = Math.max(0, Number((totalMoney - employeePaidTotal).toFixed(2)));
  const paidDatesSet = new Set(
    employeePayouts.flatMap((payout) => (Array.isArray(payout.paidDates) ? payout.paidDates : [])),
  );
  const markedDaysCount = timesheetDays.reduce((acc, d) => {
    const key = `${emp.id}__${d.iso}`;
    return acc + (timesheetPaymentMarks[key] ? 1 : 0);
  }, 0);

  return {
    accrualType,
    isShiftAccrual,
    isMarkAccrual,
    hourlyRate,
    totalShifts,
    totalHours,
    totalMoney,
    paidShifts,
    paidHours,
    totalMoneyToPay,
    totalPrimaryText,
    legendCounts,
    employeePayouts,
    employeePaidTotal,
    employeeOutstanding,
    paidDatesSet,
    markedDaysCount,
    totalColumnCount,
  };
}
