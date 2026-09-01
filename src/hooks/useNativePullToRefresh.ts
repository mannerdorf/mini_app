import { useEffect, useRef, useState, type RefObject } from "react";

const PULL_THRESHOLD_PX = 72;
const MAX_PULL_PX = 120;
const PULL_RESISTANCE = 0.45;

type UseNativePullToRefreshResult = {
  pullDistance: number;
  refreshing: boolean;
};

export function useNativePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => void | Promise<void>,
  enabled: boolean,
): UseNativePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    const resetPull = () => {
      pullingRef.current = false;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (el.scrollTop > 1) return;
      startYRef.current = event.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (el.scrollTop > 1) {
        resetPull();
        return;
      }
      const currentY = event.touches[0]?.clientY ?? startYRef.current;
      const delta = currentY - startYRef.current;
      if (delta <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      const distance = Math.min(delta * PULL_RESISTANCE, MAX_PULL_PX);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
      if (distance > 8) {
        event.preventDefault();
      }
    };

    const finishPull = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const distance = pullDistanceRef.current;
      if (distance >= PULL_THRESHOLD_PX && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullDistance(PULL_THRESHOLD_PX);
        void Promise.resolve(onRefresh())
          .catch(() => {
            /* ignore */
          })
          .finally(() => {
            refreshingRef.current = false;
            setRefreshing(false);
            pullDistanceRef.current = 0;
            setPullDistance(0);
          });
        return;
      }
      resetPull();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", finishPull);
    el.addEventListener("touchcancel", finishPull);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", finishPull);
      el.removeEventListener("touchcancel", finishPull);
    };
  }, [enabled, onRefresh, scrollRef]);

  return { pullDistance, refreshing };
}
