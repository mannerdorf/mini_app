import { useEffect, useState } from "react";
import type { DateFilter } from "../../types";
import {
  loadDateFilterState,
  saveDateFilterState,
  DATE_FILTER_STORAGE_KEY,
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

export type PersistedDateFilterOptions = {
  storageKey?: string;
};

/** Persist фильтра даты в localStorage (по умолчанию — общий для Грузы / Документы). */
export function usePersistedDateFilter(options?: PersistedDateFilterOptions): PersistedDateFilterControls {
  const storageKey = options?.storageKey ?? DATE_FILTER_STORAGE_KEY;
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => loadDateFilterState(storageKey).dateFilter);
  const [customDateFrom, setCustomDateFrom] = useState(() => loadDateFilterState(storageKey).customDateFrom);
  const [customDateTo, setCustomDateTo] = useState(() => loadDateFilterState(storageKey).customDateTo);
  const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(
    () => loadDateFilterState(storageKey).selectedMonthForFilter
  );
  const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(
    () => loadDateFilterState(storageKey).selectedYearForFilter
  );
  const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(
    () => loadDateFilterState(storageKey).selectedWeekForFilter
  );

  useEffect(() => {
    saveDateFilterState({
      dateFilter,
      customDateFrom,
      customDateTo,
      selectedMonthForFilter,
      selectedYearForFilter,
      selectedWeekForFilter,
    }, storageKey);
  }, [
    storageKey,
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
