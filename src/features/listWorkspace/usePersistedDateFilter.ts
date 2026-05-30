import { useEffect, useState } from "react";
import type { DateFilter } from "../../types";
import {
  loadDateFilterState,
  saveDateFilterState,
  type DateFilterState,
} from "../../lib/dateUtils";

export type PersistedDateFilterControls = DateFilterState & {
  setDateFilter: (value: DateFilter) => void;
  setCustomDateFrom: (value: string) => void;
  setCustomDateTo: (value: string) => void;
  setSelectedMonthForFilter: (value: { year: number; month: number } | null) => void;
  setSelectedYearForFilter: (value: number | null) => void;
  setSelectedWeekForFilter: (value: string | null) => void;
};

/** Общий фильтр даты для Грузы / Документы / Дашборд + persist в localStorage. */
export function usePersistedDateFilter(): PersistedDateFilterControls {
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => loadDateFilterState().dateFilter);
  const [customDateFrom, setCustomDateFrom] = useState(() => loadDateFilterState().customDateFrom);
  const [customDateTo, setCustomDateTo] = useState(() => loadDateFilterState().customDateTo);
  const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(
    () => loadDateFilterState().selectedMonthForFilter
  );
  const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(
    () => loadDateFilterState().selectedYearForFilter
  );
  const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(
    () => loadDateFilterState().selectedWeekForFilter
  );

  useEffect(() => {
    saveDateFilterState({
      dateFilter,
      customDateFrom,
      customDateTo,
      selectedMonthForFilter,
      selectedYearForFilter,
      selectedWeekForFilter,
    });
  }, [
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);

  return {
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
    setDateFilter,
    setCustomDateFrom,
    setCustomDateTo,
    setSelectedMonthForFilter,
    setSelectedYearForFilter,
    setSelectedWeekForFilter,
  };
}
