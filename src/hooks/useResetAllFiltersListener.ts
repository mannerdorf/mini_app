import { useEffect } from "react";
import { HAULZ_RESET_FILTERS_EVENT } from "../lib/resetAppFilters";

/** Сброс локальных фильтров страницы по глобальной кнопке «Сбросить все». */
export function useResetAllFiltersListener(onReset: () => void): void {
  useEffect(() => {
    window.addEventListener(HAULZ_RESET_FILTERS_EVENT, onReset);
    return () => window.removeEventListener(HAULZ_RESET_FILTERS_EVENT, onReset);
  }, [onReset]);
}
