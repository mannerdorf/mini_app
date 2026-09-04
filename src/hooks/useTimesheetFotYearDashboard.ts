import { useCallback, useEffect, useMemo, useState } from "react";
import * as dateUtils from "../lib/dateUtils";
import { aggregatePerevozkiFotMetrics, normalizePerevozkiList } from "../lib/perevozkiFotMetrics";
import {
  buildTimesheetFotAnalytics,
  completedMonthsInYear,
  groupTimesheetFotByDepartment,
  isCurrentIncompleteMonth,
  monthDateRange,
  monthKeyFromParts,
  monthsToFetchInYear,
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
  sales: number;
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
      body: JSON.stringify({ adminToken, dateFrom, dateTo, dateField: "vr" }),
    }),
  ]);

  const timesheetData = await timesheetRes.json().catch(() => ({}));
  if (!timesheetRes.ok) {
    throw new Error(timesheetData?.error || `Ошибка загрузки табеля за ${monthLabel}`);
  }

  const pwData = await pwRes.json().catch(() => ([]));
  const list = normalizePerevozkiList(pwData);
  const { paidWeight, sales } = aggregatePerevozkiFotMetrics(list);

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
    sales: Number(sales.toFixed(2)),
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

  const monthsInYear = useMemo(() => monthsToFetchInYear(year), [year]);

  const completedMonths = useMemo(() => completedMonthsInYear(year), [year]);

  const incompleteMonth = useMemo(() => {
    const partial = monthsInYear.find((month) => isCurrentIncompleteMonth(year, month));
    return partial ?? null;
  }, [monthsInYear, year]);

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

  const completedSnapshots = useMemo(
    () => monthSnapshots.filter((m) => completedMonths.includes(m.month)),
    [monthSnapshots, completedMonths],
  );

  const yearSummary = useMemo(() => {
    const totalCost = completedSnapshots.reduce((acc, m) => acc + m.totalCost, 0);
    const totalPaid = completedSnapshots.reduce((acc, m) => acc + m.totalPaid, 0);
    const totalOutstanding = completedSnapshots.reduce((acc, m) => acc + m.totalOutstanding, 0);
    const paidWeight = completedSnapshots.reduce((acc, m) => acc + m.paidWeight, 0);
    const sales = completedSnapshots.reduce((acc, m) => acc + m.sales, 0);
    return {
      totalCost,
      totalPaid,
      totalOutstanding,
      paidWeight,
      sales,
      costPerKg: paidWeight > 0 ? totalCost / paidWeight : 0,
      completedMonthCount: completedSnapshots.length,
    };
  }, [completedSnapshots]);

  const chartData = useMemo(
    () =>
      completedSnapshots.map((m) => ({
        name: m.monthLabel,
        month: m.month,
        fot: Math.round(m.totalCost),
        sales: Math.round(m.sales),
        costPerKg: Number(m.costPerKg.toFixed(2)),
        paidWeight: Math.round(m.paidWeight),
      })),
    [completedSnapshots],
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
    completedMonths,
    incompleteMonth,
    loading,
    error,
    monthSnapshots,
    yearSummary,
    chartData,
    departmentMatrix,
    refetch: fetchYear,
  };
}
