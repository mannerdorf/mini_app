import { useMemo } from "react";
import * as dateUtils from "../lib/dateUtils";
import type { DateFilter } from "../types";

type Params = {
  dateFilter: DateFilter;
  customDateFrom: string;
  customDateTo: string;
  selectedMonthForFilter: { year: number; month: number } | null;
  selectedYearForFilter: number | null;
  selectedWeekForFilter: string | null;
};

export function useCargoDateRange(params: Params) {
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
              ? dateUtils.getWeekRange(selectedWeekForFilter)
              : dateUtils.getDateRange(dateFilter);

    const prev = dateUtils.getPreviousPeriodRange(
      dateFilter,
      api.dateFrom,
      api.dateTo
    );
    return { apiDateRange: api, prevRange: prev };
  }, [
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);
}
