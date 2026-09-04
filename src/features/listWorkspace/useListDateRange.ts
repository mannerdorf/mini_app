import { useMemo } from "react";
import * as dateUtils from "../../lib/dateUtils";
import type { DateFilter } from "../../types";

export type ListDateRangeParams = {
  dateFilter: DateFilter;
  customDateFrom: string;
  customDateTo: string;
  selectedMonthForFilter: { year: number; month: number } | null;
  selectedQuarterForFilter: import("../../lib/dateUtils").QuarterFilterSelection | null;
  selectedYearForFilter: number | null;
  selectedWeekForFilter: string | null;
};

/** API-диапазон дат + предыдущий период (Грузы, Дашборд). */
export function useListDateRange(params: ListDateRangeParams) {
  const {
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedQuarterForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  } = params;

  return useMemo(() => {
    const api = dateUtils.resolveDateFilterToRange(dateFilter, {
      customDateFrom,
      customDateTo,
      selectedMonthForFilter,
      selectedQuarterForFilter,
      selectedYearForFilter,
      selectedWeekForFilter,
    });

    const prev = dateUtils.getPreviousPeriodRange(dateFilter, api.dateFrom, api.dateTo);
    return { apiDateRange: api, prevRange: prev };
  }, [
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedQuarterForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);
}
