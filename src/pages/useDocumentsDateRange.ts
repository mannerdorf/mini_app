import { useMemo } from "react";
import {
  getDateRange,
  getWeekRange,
} from "../lib/dateUtils";
import type { DateFilter } from "../types";

type Params = {
  dateFilter: DateFilter;
  customDateFrom: string;
  customDateTo: string;
  selectedMonthForFilter: { year: number; month: number } | null;
  selectedYearForFilter: number | null;
  selectedWeekForFilter: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isValidApiRange(r: { dateFrom: string; dateTo: string }): boolean {
  if (!ISO_DAY.test(r.dateFrom) || !ISO_DAY.test(r.dateTo)) return false;
  const fromMs = new Date(`${r.dateFrom}T12:00:00Z`).getTime();
  const toMs = new Date(`${r.dateTo}T12:00:00Z`).getTime();
  return Number.isFinite(fromMs) && Number.isFinite(toMs);
}

function monthRangeOrNull(y: number, m: number): { dateFrom: string; dateTo: string } | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(y, m, 0).getDate();
  if (!Number.isFinite(lastDay) || lastDay < 1) return null;
  return {
    dateFrom: `${y}-${pad(m)}-01`,
    dateTo: `${y}-${pad(m)}-${pad(lastDay)}`,
  };
}

function perevozkiWindowFromApi(api: { dateFrom: string; dateTo: string }): { dateFrom: string; dateTo: string } {
  const from = new Date(`${api.dateFrom}T12:00:00Z`);
  const to = new Date(`${api.dateTo}T12:00:00Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    const fb = getDateRange("месяц");
    const f0 = new Date(`${fb.dateFrom}T12:00:00Z`);
    const f1 = new Date(`${fb.dateTo}T12:00:00Z`);
    f0.setUTCMonth(f0.getUTCMonth() - 1);
    f1.setUTCMonth(f1.getUTCMonth() + 1);
    return {
      dateFrom: f0.toISOString().slice(0, 10),
      dateTo: f1.toISOString().slice(0, 10),
    };
  }
  from.setUTCMonth(from.getUTCMonth() - 1);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export function useDocumentsDateRange(params: Params) {
  const {
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  } = params;

  return useMemo(() => {
    try {
      let api: { dateFrom: string; dateTo: string };
      if (dateFilter === "все") {
        api = { dateFrom: "2000-01-01", dateTo: new Date().toISOString().slice(0, 10) };
      } else if (dateFilter === "период") {
        api = { dateFrom: customDateFrom, dateTo: customDateTo };
      } else if (dateFilter === "месяц" && selectedMonthForFilter) {
        const mr = monthRangeOrNull(selectedMonthForFilter.year, selectedMonthForFilter.month);
        api = mr ?? getDateRange(dateFilter);
      } else if (dateFilter === "год" && selectedYearForFilter != null && Number.isFinite(selectedYearForFilter)) {
        const y = selectedYearForFilter;
        api = { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
      } else if (dateFilter === "неделя" && selectedWeekForFilter) {
        api = getWeekRange(selectedWeekForFilter);
      } else {
        api = getDateRange(dateFilter);
      }

      if (!isValidApiRange(api)) {
        api = getDateRange("месяц");
      }
      if (!isValidApiRange(api)) {
        api = getDateRange("все");
      }
      if (!isValidApiRange(api)) {
        const today = new Date().toISOString().slice(0, 10);
        api = { dateFrom: "2000-01-01", dateTo: today };
      }

      return {
        apiDateRange: api,
        perevozkiDateRange: perevozkiWindowFromApi(api),
      };
    } catch {
      const api = getDateRange("все");
      return {
        apiDateRange: api,
        perevozkiDateRange: perevozkiWindowFromApi(api),
      };
    }
  }, [
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);
}
