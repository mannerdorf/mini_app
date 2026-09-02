import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DateFilter } from "../types";
import {
  DATE_FILTER_STORAGE_KEY,
  loadDateFilterState,
  saveDateFilterState,
  type DateFilterState,
} from "../lib/dateUtils";
import { HAULZ_DATE_FILTER_SYNC_EVENT } from "../lib/pullRefreshEvents";
import type { PersistedDateFilterControls } from "../features/listWorkspace/usePersistedDateFilter";

type DateFilterContextValue = PersistedDateFilterControls & {
  storageKey: string;
  reloadFromStorage: () => void;
};

const DateFilterContext = createContext<DateFilterContextValue | null>(null);

function useDateFilterState(storageKey: string): DateFilterContextValue {
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => loadDateFilterState(storageKey).dateFilter);
  const [customDateFrom, setCustomDateFrom] = useState(() => loadDateFilterState(storageKey).customDateFrom);
  const [customDateTo, setCustomDateTo] = useState(() => loadDateFilterState(storageKey).customDateTo);
  const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(
    () => loadDateFilterState(storageKey).selectedMonthForFilter,
  );
  const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(
    () => loadDateFilterState(storageKey).selectedYearForFilter,
  );
  const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(
    () => loadDateFilterState(storageKey).selectedWeekForFilter,
  );

  const applyLoadedState = useCallback((loaded: DateFilterState) => {
    setDateFilter(loaded.dateFilter);
    setCustomDateFrom(loaded.customDateFrom);
    setCustomDateTo(loaded.customDateTo);
    setSelectedMonthForFilter(loaded.selectedMonthForFilter);
    setSelectedYearForFilter(loaded.selectedYearForFilter);
    setSelectedWeekForFilter(loaded.selectedWeekForFilter);
  }, []);

  const reloadFromStorage = useCallback(() => {
    applyLoadedState(loadDateFilterState(storageKey));
  }, [applyLoadedState, storageKey]);

  useEffect(() => {
    saveDateFilterState(
      {
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
      },
      storageKey,
    );
  }, [
    storageKey,
    dateFilter,
    customDateFrom,
    customDateTo,
    selectedMonthForFilter,
    selectedYearForFilter,
    selectedWeekForFilter,
  ]);

  useEffect(() => {
    const onSync = () => reloadFromStorage();
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) reloadFromStorage();
    };
    window.addEventListener(HAULZ_DATE_FILTER_SYNC_EVENT, onSync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HAULZ_DATE_FILTER_SYNC_EVENT, onSync);
      window.removeEventListener("storage", onStorage);
    };
  }, [reloadFromStorage, storageKey]);

  return useMemo(
    () => ({
      storageKey,
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
      reloadFromStorage,
    }),
    [
      storageKey,
      dateFilter,
      customDateFrom,
      customDateTo,
      selectedMonthForFilter,
      selectedYearForFilter,
      selectedWeekForFilter,
      reloadFromStorage,
    ],
  );
}

type DateFilterProviderProps = {
  children: ReactNode;
  storageKey?: string;
};

/** Единый фильтр даты для Дашборда / Грузов / Документов — без рассинхрона при смене вкладок. */
export function DateFilterProvider({ children, storageKey = DATE_FILTER_STORAGE_KEY }: DateFilterProviderProps) {
  const value = useDateFilterState(storageKey);
  return <DateFilterContext.Provider value={value}>{children}</DateFilterContext.Provider>;
}

export function useDateFilterContext(): DateFilterContextValue | null {
  return useContext(DateFilterContext);
}
