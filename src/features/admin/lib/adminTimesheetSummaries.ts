import {
  normalizeAccrualType,
  isMarkAccrualType,
  getDayRateByAccrualType,
  normalizeShiftMark,
  parseTimesheetHoursValue,
  type EmployeeDirectoryRow,
} from "../types/adminUsers";
import { getTimesheetDepartmentLabel } from "../lib/adminTimesheetHelpers";

export type TimesheetDay = { iso: string };

export type TimesheetDepartmentGroup = {
  department: string;
  employees: EmployeeDirectoryRow[];
};

export type TimesheetPayout = {
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

export type TimesheetDepartmentSummary = {
  department: string;
  totalHours: number;
  totalShifts: number;
  totalMoney: number;
  totalMoneyToPay: number;
  totalPaid: number;
  totalOutstanding: number;
};

export type TimesheetCompanySummary = {
  totalHours: number;
  totalShifts: number;
  totalMoney: number;
  totalMoneyToPay: number;
  totalPaid: number;
  totalOutstanding: number;
};

export type TimesheetMonthPaymentStatus = {
  code: "paid" | "unpaid" | "partial";
  label: string;
  bg: string;
  border: string;
  color: string;
};

export function groupTimesheetEmployeesByDepartment(
  employees: EmployeeDirectoryRow[],
  search: string,
): TimesheetDepartmentGroup[] {
  const q = search.trim().toLowerCase();
  const filtered = employees.filter((emp) => {
    if (!q) return true;
    const haystack = [emp.full_name, emp.login, getTimesheetDepartmentLabel(emp), emp.position]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");
    return haystack.includes(q);
  });
  const grouped = new Map<string, EmployeeDirectoryRow[]>();
  for (const emp of filtered) {
    const dep = getTimesheetDepartmentLabel(emp);
    const list = grouped.get(dep) || [];
    list.push(emp);
    grouped.set(dep, list);
  }
  return Array.from(grouped.entries())
    .map(([department, groupEmployees]) => ({
      department,
      employees: [...groupEmployees].sort((a, b) => {
        const posA = String(a.position || "").trim();
        const posB = String(b.position || "").trim();
        const posCmp = (posA || "\uffff").localeCompare((posB || "\uffff"), "ru");
        if (posCmp !== 0) return posCmp;
        return String(a.full_name || a.login).localeCompare(String(b.full_name || b.login), "ru");
      }),
    }))
    .sort((a, b) => a.department.localeCompare(b.department, "ru"));
}

export function filterTimesheetVisibleGroups(
  groups: TimesheetDepartmentGroup[],
  departmentFilter: string,
): TimesheetDepartmentGroup[] {
  if (departmentFilter === "all") return groups;
  return groups.filter((group) => group.department === departmentFilter);
}

export function computeTimesheetDepartmentSummaries(
  groups: TimesheetDepartmentGroup[],
  timesheetDays: TimesheetDay[],
  timesheetHours: Record<string, string>,
  timesheetPaymentMarks: Record<string, boolean>,
  timesheetShiftRateOverrides: Record<string, number>,
  timesheetPayoutsByEmployee: Record<string, TimesheetPayout[]>,
): TimesheetDepartmentSummary[] {
  return groups.map((group) => {
    let totalHours = 0;
    let totalShifts = 0;
    let totalMoney = 0;
    let totalMoneyToPay = 0;
    let totalPaid = 0;
    for (const emp of group.employees) {
      const accrualType = normalizeAccrualType(emp.accrual_type);
      const isShiftAccrual = accrualType === "shift";
      const isMarkAccrual = isMarkAccrualType(accrualType);
      const rate = Number(emp.accrual_rate ?? 0);
      const employeePaid = (timesheetPayoutsByEmployee[String(emp.id)] || []).reduce((acc, payout) => {
        return acc + Number(payout.amount || 0);
      }, 0);
      totalPaid += employeePaid;
      if (isMarkAccrual) {
        const shifts = timesheetDays.reduce((acc, d) => {
          const key = `${emp.id}__${d.iso}`;
          return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
        }, 0);
        const paidShifts = timesheetDays.reduce((acc, d) => {
          const key = `${emp.id}__${d.iso}`;
          if (!timesheetPaymentMarks[key]) return acc;
          return acc + (normalizeShiftMark(timesheetHours[key] || "") === "Я" ? 1 : 0);
        }, 0);
        const totalShiftMoney = isShiftAccrual
          ? timesheetDays.reduce((acc, d) => {
              const key = `${emp.id}__${d.iso}`;
              if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
              const override = Number(timesheetShiftRateOverrides[key]);
              const dayRate = Number.isFinite(override) ? override : rate;
              return acc + dayRate;
            }, 0)
          : shifts * getDayRateByAccrualType(rate, accrualType);
        const paidShiftMoney = isShiftAccrual
          ? timesheetDays.reduce((acc, d) => {
              const key = `${emp.id}__${d.iso}`;
              if (!timesheetPaymentMarks[key]) return acc;
              if (normalizeShiftMark(timesheetHours[key] || "") !== "Я") return acc;
              const override = Number(timesheetShiftRateOverrides[key]);
              const dayRate = Number.isFinite(override) ? override : rate;
              return acc + dayRate;
            }, 0)
          : paidShifts * getDayRateByAccrualType(rate, accrualType);
        totalShifts += shifts;
        totalHours += shifts * 8;
        totalMoney += totalShiftMoney;
        totalMoneyToPay += paidShiftMoney;
      } else {
        const hours = timesheetDays.reduce((acc, d) => {
          const key = `${emp.id}__${d.iso}`;
          return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
        }, 0);
        const paidHours = timesheetDays.reduce((acc, d) => {
          const key = `${emp.id}__${d.iso}`;
          if (!timesheetPaymentMarks[key]) return acc;
          return acc + parseTimesheetHoursValue(timesheetHours[key] || "");
        }, 0);
        totalHours += hours;
        totalMoney += hours * rate;
        totalMoneyToPay += paidHours * rate;
      }
    }
    return {
      department: group.department,
      totalHours: Number(totalHours.toFixed(2)),
      totalShifts,
      totalMoney: Number(totalMoney.toFixed(2)),
      totalMoneyToPay: Number(totalMoneyToPay.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalOutstanding: Math.max(0, Number((totalMoney - totalPaid).toFixed(2))),
    };
  });
}

export function computeTimesheetCompanySummary(
  departmentSummaries: TimesheetDepartmentSummary[],
): TimesheetCompanySummary {
  const totalHours = departmentSummaries.reduce((acc, x) => acc + x.totalHours, 0);
  const totalShifts = departmentSummaries.reduce((acc, x) => acc + x.totalShifts, 0);
  const totalMoney = departmentSummaries.reduce((acc, x) => acc + x.totalMoney, 0);
  const totalMoneyToPay = departmentSummaries.reduce((acc, x) => acc + x.totalMoneyToPay, 0);
  const totalPaid = departmentSummaries.reduce((acc, x) => acc + x.totalPaid, 0);
  return {
    totalHours: Number(totalHours.toFixed(2)),
    totalShifts,
    totalMoney: Number(totalMoney.toFixed(2)),
    totalMoneyToPay: Number(totalMoneyToPay.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    totalOutstanding: Math.max(0, Number((totalMoney - totalPaid).toFixed(2))),
  };
}

export function computeTimesheetMonthPaymentStatus(
  companySummary: TimesheetCompanySummary,
  timesheetPayoutsByEmployee: Record<string, TimesheetPayout[]>,
): TimesheetMonthPaymentStatus {
  const totalAccrued = Number(companySummary.totalMoney || 0);
  const paidTotal = Object.values(timesheetPayoutsByEmployee).reduce((acc, payouts) => {
    return acc + payouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, 0);
  if (totalAccrued <= 0) {
    return { code: "paid", label: "Все выплачено", bg: "#ecfdf3", border: "#16a34a", color: "#166534" };
  }
  if (paidTotal <= 0) {
    return { code: "unpaid", label: "Не выплачено", bg: "#fef2f2", border: "#dc2626", color: "#991b1b" };
  }
  if (paidTotal + 0.01 >= totalAccrued) {
    return { code: "paid", label: "Все выплачено", bg: "#ecfdf3", border: "#16a34a", color: "#166534" };
  }
  return { code: "partial", label: "Выплачено частично", bg: "#fffbeb", border: "#d97706", color: "#92400e" };
}

export function computeTimesheetPaidDateKeys(
  timesheetPayoutsByEmployee: Record<string, TimesheetPayout[]>,
): Set<string> {
  const out = new Set<string>();
  for (const [employeeId, payouts] of Object.entries(timesheetPayoutsByEmployee || {})) {
    for (const payout of payouts || []) {
      for (const date of Array.isArray(payout?.paidDates) ? payout.paidDates : []) {
        out.add(`${employeeId}__${String(date || "")}`);
      }
    }
  }
  return out;
}
