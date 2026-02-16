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
    const api =
      dateFilter === "период"
        ? { dateFrom: customDateFrom, dateTo: customDateTo }
        : dateFilter === "месяц" && selectedMonthForFilter
          ? (() => {
              const { year, month } = selectedMonthForFilter;
              const pad = (n: number) => String(n).padStart(2, "0");
              const lastDay = new Date(year, month, 0).getDate();
              return {
                dateFrom: `${year}-${pad(month)}-01`,
                dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
              };
            })()
          : dateFilter === "год" && selectedYearForFilter
            ? {
                dateFrom: `${selectedYearForFilter}-01-01`,
                dateTo: `${selectedYearForFilter}-12-31`,
              }
            : dateFilter === "неделя" && selectedWeekForFilter
              ? getWeekRange(selectedWeekForFilter)
              : getDateRange(dateFilter);

    const from = new Date(`${api.dateFrom}T12:00:00Z`);
    const to = new Date(`${api.dateTo}T12:00:00Z`);
    from.setUTCMonth(from.getUTCMonth() - 1);
    to.setUTCMonth(to.getUTCMonth() + 1);

    return {
      apiDateRange: api,
      perevozkiDateRange: {
        dateFrom: from.toISOString().slice(0, 10),
        dateTo: to.toISOString().slice(0, 10),
      },
    };
  }, [
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);
}

