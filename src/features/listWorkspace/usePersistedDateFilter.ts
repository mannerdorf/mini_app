import { useEffect, useState } from "react";
import type { DateFilter } from "../../types";
import { useDateFilterContext } from "../../contexts/DateFilterContext";
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
  setSelectedQuarterForFilter: (value: import("../../lib/dateUtils").QuarterFilterSelection | null) => void;
  setSelectedYearForFilter: (value: number | null) => void;
  setSelectedWeekForFilter: (value: string | null) => void;
};

export type PersistedDateFilterOptions = {
  storageKey?: string;
};

function useLocalPersistedDateFilter(storageKey: string, active: boolean): PersistedDateFilterControls {
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => loadDateFilterState(storageKey).dateFilter);
  const [customDateFrom, setCustomDateFrom] = useState(() => loadDateFilterState(storageKey).customDateFrom);
  const [customDateTo, setCustomDateTo] = useState(() => loadDateFilterState(storageKey).customDateTo);
  const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(
    () => loadDateFilterState(storageKey).selectedMonthForFilter
  );
  const [selectedQuarterForFilter, setSelectedQuarterForFilter] = useState(
    () => loadDateFilterState(storageKey).selectedQuarterForFilter
  );
  const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(
    () => loadDateFilterState(storageKey).selectedYearForFilter
  );
  const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(
    () => loadDateFilterState(storageKey).selectedWeekForFilter
  );

  useEffect(() => {
    if (!active) return;
    saveDateFilterState({
      dateFilter,
      customDateFrom,
      customDateTo,
      selectedMonthForFilter,
      selectedQuarterForFilter,
      selectedYearForFilter,
      selectedWeekForFilter,
    }, storageKey);
  }, [
    active,
    storageKey,
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedQuarterForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);

  return {
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedQuarterForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
    setDateFilter,
    setCustomDateFrom,
    setCustomDateTo,
    setSelectedMonthForFilter,
    setSelectedQuarterForFilter,
    setSelectedYearForFilter,
    setSelectedWeekForFilter,
  };
}

/** Persist фильтра даты в localStorage (по умолчанию — общий для Грузы / Документы). */
export function usePersistedDateFilter(options?: PersistedDateFilterOptions): PersistedDateFilterControls {
  const storageKey = options?.storageKey ?? DATE_FILTER_STORAGE_KEY;
  const shared = useDateFilterContext();
  const useShared = shared != null && shared.storageKey === storageKey;
  const local = useLocalPersistedDateFilter(storageKey, !useShared);
  return useShared ? shared : local;
}
