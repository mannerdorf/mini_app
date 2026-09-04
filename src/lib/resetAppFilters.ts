import {
  DATE_FILTER_STORAGE_KEY,
  normalizeDateFilterState,
  saveDateFilterState,
} from "./dateUtils";
import { HAULZ_DATE_FILTER_SYNC_EVENT } from "./pullRefreshEvents";
import { saveSharedListFilters } from "./sharedListFilters";

export const HAULZ_RESET_FILTERS_EVENT = "haulz-reset-filters";

/** Сброс сквозных фильтров (дата + тип/маршрут/счёт) и оповещение страниц. */
export function resetAllAppFilters(): void {
  const defaultDate = normalizeDateFilterState(null);
  saveDateFilterState(defaultDate, DATE_FILTER_STORAGE_KEY);
  saveSharedListFilters({
    cargoStatusKeys: [],
    billStatusKeys: [],
    typeKeys: [],
    routeKeys: [],
  });
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HAULZ_DATE_FILTER_SYNC_EVENT));
  window.dispatchEvent(new CustomEvent(HAULZ_RESET_FILTERS_EVENT));
}
