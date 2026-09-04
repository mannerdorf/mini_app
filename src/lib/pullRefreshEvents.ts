export const HAULZ_DATE_FILTER_SYNC_EVENT = "haulz-date-filter-sync";
export const HAULZ_PULL_REFRESH_EVENT = "haulz-pull-refresh";

export function dispatchPullRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HAULZ_DATE_FILTER_SYNC_EVENT));
  window.dispatchEvent(new CustomEvent(HAULZ_PULL_REFRESH_EVENT));
}
