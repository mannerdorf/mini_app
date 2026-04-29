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
    const api = dateUtils.resolveDateFilterToRange(dateFilter, {
      customDateFrom,
      customDateTo,
      selectedMonthForFilter,
      selectedYearForFilter,
      selectedWeekForFilter,
    });

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
