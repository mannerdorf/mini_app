import { useMemo } from "react";
import { getSlaInfo } from "../../../lib/cargoUtils";
import { isFerry } from "../../../lib/cargoUtils";
import type { WorkSchedule } from "../../../lib/slaWorkSchedule";
import type { CargoItem } from "../../../types";

export type UseDashboardSlaMetricsParams = {
    slaMonitorFilteredItems: CargoItem[];
    workScheduleByInn: Record<string, WorkSchedule>;
};

export function useDashboardSlaMetrics({
    slaMonitorFilteredItems,
    workScheduleByInn,
}: UseDashboardSlaMetricsParams) {
    const slaStats = useMemo(() => {
        const withSla = slaMonitorFilteredItems
            .map((i) => getSlaInfo(i, workScheduleByInn))
            .filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
        const total = withSla.length;
        const onTime = withSla.filter((s) => s.onTime).length;
        const delayed = withSla.filter((s) => !s.onTime);
        const avgDelay =
            delayed.length > 0
                ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length)
                : 0;
        const actualDaysValid = withSla.map((s) => s.actualDays).filter((d) => d >= 0);
        const minDays = actualDaysValid.length ? Math.min(...actualDaysValid) : 0;
        const maxDays = actualDaysValid.length ? Math.max(...actualDaysValid) : 0;
        const avgDays = actualDaysValid.length
            ? Math.round(actualDaysValid.reduce((a, b) => a + b, 0) / actualDaysValid.length)
            : 0;
        return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay, minDays, maxDays, avgDays };
    }, [slaMonitorFilteredItems, workScheduleByInn]);

    const slaStatsByType = useMemo(() => {
        const autoItems = slaMonitorFilteredItems.filter((i) => !isFerry(i));
        const ferryItems = slaMonitorFilteredItems.filter((i) => isFerry(i));
        const calc = (arr: CargoItem[]) => {
            const withSla = arr
                .map((i) => getSlaInfo(i, workScheduleByInn))
                .filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
            const total = withSla.length;
            const onTime = withSla.filter((s) => s.onTime).length;
            const delayed = withSla.filter((s) => !s.onTime);
            const avgDelay =
                delayed.length > 0
                    ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length)
                    : 0;
            return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay };
        };
        return { auto: calc(autoItems), ferry: calc(ferryItems) };
    }, [slaMonitorFilteredItems, workScheduleByInn]);

    const outOfSlaByType = useMemo(() => {
        const withSla = slaMonitorFilteredItems
            .map((i) => ({ item: i, sla: getSlaInfo(i, workScheduleByInn) }))
            .filter(
                (x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } =>
                    x.sla != null && !x.sla.onTime,
            );
        return {
            auto: withSla.filter((x) => !isFerry(x.item)),
            ferry: withSla.filter((x) => isFerry(x.item)),
        };
    }, [slaMonitorFilteredItems, workScheduleByInn]);

    const slaTrend = useMemo(() => {
        const withSla = slaMonitorFilteredItems
            .map((i) => ({ item: i, sla: getSlaInfo(i, workScheduleByInn) }))
            .filter(
                (x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } =>
                    x.sla != null,
            );
        if (withSla.length < 4) return null;
        const sorted = [...withSla].sort(
            (a, b) => new Date(a.item.DateVr || 0).getTime() - new Date(b.item.DateVr || 0).getTime(),
        );
        const mid = Math.floor(sorted.length / 2);
        const first = sorted.slice(0, mid);
        const second = sorted.slice(mid);
        const p1 = first.length ? Math.round((first.filter((x) => x.sla.onTime).length / first.length) * 100) : 0;
        const p2 = second.length ? Math.round((second.filter((x) => x.sla.onTime).length / second.length) * 100) : 0;
        if (p2 > p1) return "up";
        if (p2 < p1) return "down";
        return null;
    }, [slaMonitorFilteredItems, workScheduleByInn]);

    return { slaStats, slaStatsByType, outOfSlaByType, slaTrend };
}

export type DashboardSlaMetricsState = ReturnType<typeof useDashboardSlaMetrics>;
