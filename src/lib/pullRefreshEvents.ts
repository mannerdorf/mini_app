export const HAULZ_PULL_REFRESH_EVENT = "haulz-pull-refresh";

export function dispatchPullRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HAULZ_PULL_REFRESH_EVENT));
}
