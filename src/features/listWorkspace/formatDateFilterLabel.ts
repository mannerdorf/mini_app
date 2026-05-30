import { getWeekRange, MONTH_NAMES } from "../../lib/dateUtils";
import type { DateFilter } from "../../types";

export type DateFilterLabelParams = {
  dateFilter: DateFilter;
  apiDateRange: { dateFrom: string; dateTo: string };
  selectedMonthForFilter: { year: number; month: number } | null;
  selectedYearForFilter: number | null;
  selectedWeekForFilter: string | null;
};

/** Текст кнопки «Дата: …» в тулбаре списков. */
export function formatDateFilterButtonLabel(params: DateFilterLabelParams): string {
  const {
    dateFilter,
    apiDateRange,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  } = params;

  if (dateFilter === "период") return "Период";
  if (dateFilter === "месяц" && selectedMonthForFilter) {
    return `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}`;
  }
  if (dateFilter === "год" && selectedYearForFilter != null) {
    return `${selectedYearForFilter}`;
  }
  if (dateFilter === "неделя" && selectedWeekForFilter) {
    const r = getWeekRange(selectedWeekForFilter);
    return `${r.dateFrom.slice(8, 10)}.${r.dateFrom.slice(5, 7)} – ${r.dateTo.slice(8, 10)}.${r.dateTo.slice(5, 7)}`;
  }
  if (dateFilter === "неделя") {
    return `${apiDateRange.dateFrom.slice(8, 10)}.${apiDateRange.dateFrom.slice(5, 7)} – ${apiDateRange.dateTo.slice(8, 10)}.${apiDateRange.dateTo.slice(5, 7)}`;
  }
  return dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1);
}
