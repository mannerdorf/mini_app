import { useLayoutEffect, type RefObject } from "react";

export type UseDashboardMainChartLayoutParams = {
    widget3Chart: boolean;
    showOnlySla: boolean;
    showSums: boolean;
    loading: boolean;
    error: unknown;
    chartDataLength: number;
    chartType: string;
    mainChartWrapRef: RefObject<HTMLDivElement | null>;
    setMainChartOuterWidthPx: (width: number) => void;
};

/** Подгоняет ширину контейнера основного графика динамики под ResizeObserver. */
export function useDashboardMainChartLayout({
    widget3Chart,
    showOnlySla,
    showSums,
    loading,
    error,
    chartDataLength,
    chartType,
    mainChartWrapRef,
    setMainChartOuterWidthPx,
}: UseDashboardMainChartLayoutParams) {
    useLayoutEffect(() => {
        if (!widget3Chart || showOnlySla || !showSums) return;
        const el = mainChartWrapRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.getBoundingClientRect().width;
            if (w > 0) setMainChartOuterWidthPx(Math.max(280, Math.floor(w)));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [widget3Chart, showOnlySla, showSums, loading, error, chartDataLength, chartType, mainChartWrapRef, setMainChartOuterWidthPx]);
}
