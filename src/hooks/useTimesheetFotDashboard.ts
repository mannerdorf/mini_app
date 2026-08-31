import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthData } from "../types";
import { aggregatePerevozkiFotMetrics, normalizePerevozkiList } from "../lib/perevozkiFotMetrics";
import {
  buildTimesheetFotAnalytics,
  groupTimesheetFotByDepartment,
  monthDateRange,
  monthKeyFromParts,
} from "../lib/timesheetFotAnalytics";

export type TimesheetFotMode = "user" | "admin";

export type UseTimesheetFotDashboardArgs =
  | {
      mode: "admin";
      adminToken: string;
      enabled?: boolean;
    }
  | {
      mode: "user";
      auth: AuthData;
      useServiceRequest: boolean;
      enabled?: boolean;
    };

export function useTimesheetFotDashboard(args: UseTimesheetFotDashboardArgs) {
  const enabled = args.enabled !== false;
  const [period, setPeriod] = useState<{ year: number; month: number }>(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  const monthKey = useMemo(() => monthKeyFromParts(period.year, period.month), [period.month, period.year]);
  const dateRange = useMemo(() => monthDateRange(period.year, period.month), [period.month, period.year]);

  const yearOptions = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const years = new Set<number>([nowYear - 2, nowYear - 1, nowYear, nowYear + 1, period.year]);
    return Array.from(years).sort((a, b) => b - a);
  }, [period.year]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidWeight, setPaidWeight] = useState(0);
  const [sales, setSales] = useState(0);
  const [analyticsData, setAnalyticsData] = useState<ReturnType<typeof buildTimesheetFotAnalytics> | null>(null);

  const mode = args.mode;
  const adminToken = mode === "admin" ? args.adminToken : "";
  const auth = mode === "user" ? args.auth : undefined;
  const useServiceRequest = mode === "user" ? args.useServiceRequest : false;

  const fetchTimesheet = useCallback(async () => {
    if (!enabled) return;
    if (mode === "admin") {
      if (!adminToken) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin-company-timesheet", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ month: monthKey }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Ошибка загрузки данных табеля");
        setAnalyticsData(buildTimesheetFotAnalytics(data));
      } catch (e: unknown) {
        setError((e as Error)?.message || "Ошибка загрузки данных табеля");
        setAnalyticsData(null);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!auth?.login || !auth?.password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my-department-timesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: auth.login,
          password: auth.password,
          month: monthKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки данных табеля");
      setAnalyticsData(buildTimesheetFotAnalytics(data));
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки данных табеля");
      setAnalyticsData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, mode, adminToken, auth?.login, auth?.password, monthKey]);

  useEffect(() => {
    void fetchTimesheet();
  }, [fetchTimesheet]);

  const fetchPw = useCallback(async () => {
    if (!enabled) return;
    if (mode === "admin") {
      if (!adminToken) return;
      try {
        const res = await fetch("/api/perevozki", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            adminToken,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
          }),
        });
        const data = await res.json().catch(() => ([]));
        const list = normalizePerevozkiList(data);
        const metrics = aggregatePerevozkiFotMetrics(list);
        setPaidWeight(metrics.paidWeight);
        setSales(metrics.sales);
      } catch {
        setPaidWeight(0);
        setSales(0);
      }
      return;
    }
    if (!auth?.login || !auth?.password) return;
    try {
      const res = await fetch("/api/perevozki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: auth.login,
          password: auth.password,
          dateFrom: dateRange.dateFrom,
          dateTo: dateRange.dateTo,
          ...(useServiceRequest ? { serviceMode: true } : {}),
          ...(!useServiceRequest && auth?.inn ? { inn: auth.inn } : {}),
          ...(auth?.isRegisteredUser ? { isRegisteredUser: true } : {}),
        }),
      });
      const data = await res.json().catch(() => ([]));
      const list = normalizePerevozkiList(data);
      const metrics = aggregatePerevozkiFotMetrics(list);
      setPaidWeight(metrics.paidWeight);
      setSales(metrics.sales);
    } catch {
      setPaidWeight(0);
      setSales(0);
    }
  }, [enabled, mode, adminToken, auth?.login, auth?.password, auth?.inn, auth?.isRegisteredUser, useServiceRequest, dateRange.dateFrom, dateRange.dateTo]);

  useEffect(() => {
    void fetchPw();
  }, [fetchPw]);

  const companySummary = useMemo(
    () => ({
      totalHours: Number(analyticsData?.totalHours || 0),
      totalShifts: Number(analyticsData?.totalShifts || 0),
      totalMoney: Number(analyticsData?.totalCost || 0),
      totalPaid: Number(analyticsData?.totalPaid || 0),
      totalOutstanding: Number(analyticsData?.totalOutstanding || 0),
    }),
    [
      analyticsData?.totalHours,
      analyticsData?.totalShifts,
      analyticsData?.totalCost,
      analyticsData?.totalPaid,
      analyticsData?.totalOutstanding,
    ],
  );

  const costPerKg = useMemo(() => {
    if (!(paidWeight > 0)) return 0;
    return companySummary.totalMoney / paidWeight;
  }, [companySummary.totalMoney, paidWeight]);

  const byDepartment = useMemo(
    () => (analyticsData ? groupTimesheetFotByDepartment(analyticsData, paidWeight) : []),
    [analyticsData, paidWeight],
  );

  return {
    period,
    setPeriod,
    monthKey,
    dateRange,
    yearOptions,
    loading,
    error,
    paidWeight,
    sales,
    companySummary,
    costPerKg,
    byDepartment,
    refetch: fetchTimesheet,
  };
}
