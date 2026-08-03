import { useLayoutEffect, type RefObject } from "react";

export type UseDashboardMaChartLayoutParams = {
    useServiceRequest: boolean;
    loading: boolean;
    error: unknown;
    showOnlySla: boolean;
    movingAverage7: { date: string; dateKey?: string; value: number }[] | null;
    maChartType: string;
    maChartWrapRef: RefObject<HTMLDivElement | null>;
    setMaChartOuterWidthPx: (width: number) => void;
};

/** Подгоняет ширину контейнера MA-графика под ResizeObserver. */
export function useDashboardMaChartLayout({
    useServiceRequest,
    loading,
    error,
    showOnlySla,
    movingAverage7,
    maChartType,
    maChartWrapRef,
    setMaChartOuterWidthPx,
}: UseDashboardMaChartLayoutParams) {
    useLayoutEffect(() => {
        if (!useServiceRequest || loading || error || showOnlySla || !movingAverage7 || movingAverage7.length <= 2) return;
        const el = maChartWrapRef.current;
        if (!el) return;
        const measure = () => {
            const rw = el.getBoundingClientRect().width;
            if (rw > 0) setMaChartOuterWidthPx(Math.max(280, Math.floor(rw)));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [useServiceRequest, loading, error, showOnlySla, movingAverage7, maChartType, maChartWrapRef, setMaChartOuterWidthPx]);
}
