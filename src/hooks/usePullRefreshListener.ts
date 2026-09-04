import { useEffect } from "react";
import { HAULZ_PULL_REFRESH_EVENT } from "../lib/pullRefreshEvents";

/** Подписка на нативный pull-to-refresh (событие haulz-pull-refresh). */
export function usePullRefreshListener(onRefresh: () => void | Promise<void>): void {
  useEffect(() => {
    const handler = () => {
      void Promise.resolve(onRefresh()).catch(() => {
        /* ignore */
      });
    };
    window.addEventListener(HAULZ_PULL_REFRESH_EVENT, handler);
    return () => window.removeEventListener(HAULZ_PULL_REFRESH_EVENT, handler);
  }, [onRefresh]);
}
