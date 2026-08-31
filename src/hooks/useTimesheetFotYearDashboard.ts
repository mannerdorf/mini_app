import { useCallback, useEffect, useMemo, useState } from "react";
import { isReceivedInfoStatus } from "../lib/statusUtils";
import * as dateUtils from "../lib/dateUtils";
import {
  buildTimesheetFotAnalytics,
  groupTimesheetFotByDepartment,
  monthDateRange,
  monthKeyFromParts,
  type TimesheetFotDepartmentRow,
} from "../lib/timesheetFotAnalytics";

export type FotMonthSnapshot = {
  month: number;
  monthKey: string;
  monthLabel: string;
  totalCost: number;
  totalPaid: number;
  totalOutstanding: number;
  paidWeight: number;
  costPerKg: number;
  byDepartment: TimesheetFotDepartmentRow[];
};

export type FotYearDepartmentRow = {
  department: string;
  yearTotalCost: number;
  yearTotalPaid: number;
  yearTotalOutstanding: number;
  months: Record<number, { totalCost: number; costPerKg: number; totalPaid: number; totalOutstanding: number } | null>;
};

async function fetchAdminMonthSnapshot(adminToken: string, year: number, month: number): Promise<FotMonthSnapshot> {
  const monthKey = monthKeyFromParts(year, month);
  const { dateFrom, dateTo } = monthDateRange(year, month);
  const monthLabel = dateUtils.MONTH_NAMES[month - 1]?.slice(0, 3) ?? String(month);

  const [timesheetRes, pwRes] = await Promise.all([
    fetch("/api/admin-company-timesheet", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ month: monthKey }),
    }),
    fetch("/api/perevozki", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ adminToken, dateFrom, dateTo }),
    }),
  ]);

  const timesheetData = await timesheetRes.json().catch(() => ({}));
  if (!timesheetRes.ok) {
    throw new Error(timesheetData?.error || `Ошибка загрузки табеля за ${monthLabel}`);
  }

  const pwData = await pwRes.json().catch(() => ([]));
  const list = Array.isArray(pwData) ? pwData : Array.isArray(pwData?.items) ? pwData.items : [];
  const paidWeight = list.reduce((acc: number, item: any) => {
    if (isReceivedInfoStatus(item?.State)) return acc;
    const pwRaw = item?.PW;
    const pw = typeof pwRaw === "string" ? parseFloat(pwRaw) || 0 : Number(pwRaw || 0);
    return acc + pw;
  }, 0);

  const analytics = buildTimesheetFotAnalytics(timesheetData);
  const roundedPw = Number(paidWeight.toFixed(2));

  return {
    month,
    monthKey,
    monthLabel,
    totalCost: analytics.totalCost,
    totalPaid: analytics.totalPaid,
    totalOutstanding: analytics.totalOutstanding,
    paidWeight: roundedPw,
    costPerKg: roundedPw > 0 ? analytics.totalCost / roundedPw : 0,
    byDepartment: groupTimesheetFotByDepartment(analytics, roundedPw),
  };
}

export function useTimesheetFotYearDashboard(adminToken: string, enabled = true) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthSnapshots, setMonthSnapshots] = useState<FotMonthSnapshot[]>([]);

  const yearOptions = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const years = new Set<number>([nowYear - 2, nowYear - 1, nowYear, nowYear + 1, year]);
    return Array.from(years).sort((a, b) => b - a);
  }, [year]);

  const monthsInYear = useMemo(() => {
    const now = new Date();
    const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    return Array.from({ length: maxMonth }, (_, i) => i + 1);
  }, [year]);

  const fetchYear = useCallback(async () => {
    if (!enabled || !adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const snapshots = await Promise.all(
        monthsInYear.map((month) => fetchAdminMonthSnapshot(adminToken, year, month)),
      );
      setMonthSnapshots(snapshots);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки годовой аналитики ФОТ");
      setMonthSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, enabled, monthsInYear, year]);

  useEffect(() => {
    void fetchYear();
  }, [fetchYear]);

  const yearSummary = useMemo(() => {
    const totalCost = monthSnapshots.reduce((acc, m) => acc + m.totalCost, 0);
    const totalPaid = monthSnapshots.reduce((acc, m) => acc + m.totalPaid, 0);
    const totalOutstanding = monthSnapshots.reduce((acc, m) => acc + m.totalOutstanding, 0);
    const paidWeight = monthSnapshots.reduce((acc, m) => acc + m.paidWeight, 0);
    return {
      totalCost,
      totalPaid,
      totalOutstanding,
      paidWeight,
      costPerKg: paidWeight > 0 ? totalCost / paidWeight : 0,
    };
  }, [monthSnapshots]);

  const chartData = useMemo(
    () =>
      monthSnapshots.map((m) => ({
        name: m.monthLabel,
        month: m.month,
        fot: Math.round(m.totalCost),
        costPerKg: Number(m.costPerKg.toFixed(2)),
        paidWeight: Math.round(m.paidWeight),
      })),
    [monthSnapshots],
  );

  const departmentMatrix = useMemo((): FotYearDepartmentRow[] => {
    const departmentSet = new Set<string>();
    for (const snapshot of monthSnapshots) {
      for (const row of snapshot.byDepartment) {
        departmentSet.add(row.department);
      }
    }

    const rows: FotYearDepartmentRow[] = Array.from(departmentSet).map((department) => {
      const months: FotYearDepartmentRow["months"] = {};
      let yearTotalCost = 0;
      let yearTotalPaid = 0;
      let yearTotalOutstanding = 0;

      for (const snapshot of monthSnapshots) {
        const depRow = snapshot.byDepartment.find((r) => r.department === department);
        if (!depRow) {
          months[snapshot.month] = null;
          continue;
        }
        months[snapshot.month] = {
          totalCost: depRow.totalCost,
          costPerKg: depRow.costPerKg,
          totalPaid: depRow.totalPaid,
          totalOutstanding: depRow.totalOutstanding,
        };
        yearTotalCost += depRow.totalCost;
        yearTotalPaid += depRow.totalPaid;
        yearTotalOutstanding += depRow.totalOutstanding;
      }

      return {
        department,
        yearTotalCost,
        yearTotalPaid,
        yearTotalOutstanding,
        months,
      };
    });

    return rows.sort((a, b) => b.yearTotalCost - a.yearTotalCost);
  }, [monthSnapshots]);

  return {
    year,
    setYear,
    yearOptions,
    monthsInYear,
    loading,
    error,
    monthSnapshots,
    yearSummary,
    chartData,
    departmentMatrix,
    refetch: fetchYear,
  };
}
