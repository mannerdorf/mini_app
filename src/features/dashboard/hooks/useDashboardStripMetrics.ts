import { useCallback, useMemo } from "react";
import * as dateUtils from "../../../lib/dateUtils";
import { getFilterKeyByStatus } from "../../../lib/statusUtils";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { calcStripDynamics } from "../StripDynamicsBadge";
import type { DashboardChartPoint } from "../dashboardTypes";
import type { CargoItem } from "../../../types";

const { formatDate, isDateInRange } = dateUtils;

export type UseDashboardStripMetricsParams = {
    dashboardTotalItems: CargoItem[];
    dashboardTotalPrevPeriodItems: CargoItem[];
    deliveryFactItems: CargoItem[];
    chartType: "money" | "paidWeight" | "weight" | "volume" | "pieces";
    stripTab: "type" | "sender" | "receiver" | "customer";
    showSums: boolean;
    useServiceRequest: boolean;
    apiDateRange: { dateFrom: string; dateTo: string };
};

export function useDashboardStripMetrics({
    dashboardTotalItems,
    dashboardTotalPrevPeriodItems,
    deliveryFactItems,
    chartType,
    stripTab,
    showSums,
    useServiceRequest,
    apiDateRange,
    }: UseDashboardStripMetricsParams) {
    // Подготовка данных для графиков (группировка по датам)
    const chartData = useMemo(() => {
    const dataMap = new Map<string, { date: string; sum: number; pw: number; w: number; mest: number; vol: number }>();
    
    dashboardTotalItems.forEach(item => {
        if (!item.DatePrih) return;
        const rawDate = String(item.DatePrih ?? '').trim();
        if (!rawDate) return;
        const dateKey = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
        const displayDate = formatDate(rawDate);
        if (!dateKey || displayDate === '-') return;
        const existing = dataMap.get(dateKey) || { date: displayDate, dateKey, sum: 0, pw: 0, w: 0, mest: 0, vol: 0 };
        existing.sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        existing.pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        existing.w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
        existing.mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        existing.vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
        dataMap.set(dateKey, existing);
    });
    return Array.from(dataMap.values()).sort((a, b) => (a.dateKey || a.date).localeCompare(b.dateKey || b.date));
    }, [dashboardTotalItems]);

    const DIAGRAM_COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#3b82f6', '#ef4444', '#84cc16'];
    const stripTotals = useMemo(() => {
    let sum = 0, pw = 0, w = 0, vol = 0, mest = 0;
    dashboardTotalItems.forEach(item => {
        sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
        vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
        mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
    });
    return { sum, pw, w, vol, mest };
}, [dashboardTotalItems]);

const getValForChart = useCallback((item: CargoItem) => {
    if (chartType === 'money') return typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
    if (chartType === 'paidWeight') return typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
    if (chartType === 'weight') return typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
    if (chartType === 'pieces') return typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
    return typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
}, [chartType]);

/** Монитор доставки: только статус «доставлено» с DateVr в выбранном периоде (без фильтра по заказчику) */
const deliveryFilteredItems = useMemo(() => {
    return deliveryFactItems.filter(i => getFilterKeyByStatus(i.State) === 'delivered' && isDateInRange(i.DateVr, apiDateRange.dateFrom, apiDateRange.dateTo));
}, [deliveryFactItems, apiDateRange.dateFrom, apiDateRange.dateTo]);
const deliveryStripTotals = useMemo(() => {
    let sum = 0, pw = 0, w = 0, vol = 0, mest = 0;
    deliveryFilteredItems.forEach(item => {
        sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
        vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
        mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
    });
    return { sum, pw, w, vol, mest };
}, [deliveryFilteredItems]);
const deliveryStripDiagramByType = useMemo(() => {
    let autoVal = 0, ferryVal = 0;
    deliveryFilteredItems.forEach(item => {
        const v = getValForChart(item);
        if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryVal += v;
        else autoVal += v;
    });
    const total = autoVal + ferryVal || 1;
    return [
        { label: 'Авто', value: autoVal, percent: Math.round((autoVal / total) * 100), color: DIAGRAM_COLORS[0] },
        { label: 'Паром', value: ferryVal, percent: Math.round((ferryVal / total) * 100), color: DIAGRAM_COLORS[1] },
    ];
}, [deliveryFilteredItems, chartType, getValForChart]);
const deliveryStripDiagramBySender = useMemo(() => {
    const map = new Map<string, number>();
    deliveryFilteredItems.forEach(item => {
        const key = (item.Sender ?? '').trim() || '—';
        map.set(key, (map.get(key) || 0) + getValForChart(item));
    });
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()]
        .map(([name, value], i) => ({ name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length] }))
        .sort((a, b) => b.value - a.value);
}, [deliveryFilteredItems, chartType, getValForChart]);
const deliveryStripDiagramByReceiver = useMemo(() => {
    const map = new Map<string, number>();
    deliveryFilteredItems.forEach(item => {
        const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
        map.set(key, (map.get(key) || 0) + getValForChart(item));
    });
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()]
        .map(([name, value], i) => ({ name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length] }))
        .sort((a, b) => b.value - a.value);
}, [deliveryFilteredItems, chartType, getValForChart]);

const stripDiagramByType = useMemo(() => {
    let autoVal = 0, ferryVal = 0;
    dashboardTotalItems.forEach(item => {
        const v = getValForChart(item);
        if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryVal += v;
        else autoVal += v;
    });
    let autoPrev = 0, ferryPrev = 0;
    const hasPrev = useServiceRequest && dashboardTotalPrevPeriodItems.length > 0;
    if (hasPrev) {
        dashboardTotalPrevPeriodItems.forEach(item => {
            const v = getValForChart(item);
            if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryPrev += v;
            else autoPrev += v;
        });
    }
    const total = autoVal + ferryVal || 1;
    return [
        { label: 'Авто', value: autoVal, percent: Math.round((autoVal / total) * 100), color: DIAGRAM_COLORS[0], dynamics: calcStripDynamics(autoVal, autoPrev, hasPrev) },
        { label: 'Паром', value: ferryVal, percent: Math.round((ferryVal / total) * 100), color: DIAGRAM_COLORS[1], dynamics: calcStripDynamics(ferryVal, ferryPrev, hasPrev) },
    ];
}, [dashboardTotalItems, dashboardTotalPrevPeriodItems, useServiceRequest, chartType, getValForChart]);

const stripDiagramBySender = useMemo(() => {
    const map = new Map<string, number>();
    const prevMap = new Map<string, number>();
    dashboardTotalItems.forEach(item => {
        const key = (item.Sender ?? '').trim() || '—';
        map.set(key, (map.get(key) || 0) + getValForChart(item));
    });
    const hasPrev = useServiceRequest && dashboardTotalPrevPeriodItems.length > 0;
    if (hasPrev) {
        dashboardTotalPrevPeriodItems.forEach(item => {
            const key = (item.Sender ?? '').trim() || '—';
            prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
        });
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()]
        .map(([name, value], i) => {
            const prevVal = prevMap.get(name) ?? 0;
            return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics: calcStripDynamics(value, prevVal, hasPrev) };
        })
        .sort((a, b) => b.value - a.value);
}, [dashboardTotalItems, dashboardTotalPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
const stripDiagramByReceiver = useMemo(() => {
    const map = new Map<string, number>();
    const prevMap = new Map<string, number>();
    dashboardTotalItems.forEach(item => {
        const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
        map.set(key, (map.get(key) || 0) + getValForChart(item));
    });
    const hasPrev = useServiceRequest && dashboardTotalPrevPeriodItems.length > 0;
    if (hasPrev) {
        dashboardTotalPrevPeriodItems.forEach(item => {
            const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
            prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
        });
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()]
        .map(([name, value], i) => {
            const prevVal = prevMap.get(name) ?? 0;
            return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics: calcStripDynamics(value, prevVal, hasPrev) };
        })
        .sort((a, b) => b.value - a.value);
}, [dashboardTotalItems, dashboardTotalPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
const stripDiagramByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    const prevMap = new Map<string, number>();
    dashboardTotalItems.forEach(item => {
        const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
        map.set(key, (map.get(key) || 0) + getValForChart(item));
    });
    const hasPrev = useServiceRequest && dashboardTotalPrevPeriodItems.length > 0;
    if (hasPrev) {
        dashboardTotalPrevPeriodItems.forEach(item => {
            const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
            prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
        });
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()]
        .map(([name, value], i) => {
            const prevVal = prevMap.get(name) ?? 0;
            return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics: calcStripDynamics(value, prevVal, hasPrev) };
        })
        .sort((a, b) => b.value - a.value);
}, [dashboardTotalItems, dashboardTotalPrevPeriodItems, useServiceRequest, chartType, getValForChart]);

const stripLineChartData = useMemo(() => {
    if (!showSums || stripTab === 'type') return null;

    const sourceRows = stripTab === 'sender'
        ? stripDiagramBySender
        : stripTab === 'receiver'
            ? stripDiagramByReceiver
            : stripDiagramByCustomer;

    const topRows = sourceRows.slice(0, 8);
    if (topRows.length === 0) return null;

    const selected = new Set(topRows.map((row) => row.name));
    const byDate = new Map<string, Map<string, number>>();
    const toDateKey = (raw?: string) => {
        const parsed = dateUtils.parseDateOnly(raw);
        if (!parsed) return '';
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    dashboardTotalItems.forEach((item) => {
        const dateKey = toDateKey(item.DatePrih || item.DateVr);
        if (!dateKey) return;

        const rawName = stripTab === 'sender'
            ? (item.Sender ?? '').trim() || '—'
            : stripTab === 'receiver'
                ? (item.Receiver ?? (item as any).receiver ?? '').trim() || '—'
                : (item.Customer ?? (item as any).customer ?? '').trim() || '—';
        const name = stripOoo(rawName);
        if (!selected.has(name)) return;

        const money = typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        if (!byDate.has(dateKey)) byDate.set(dateKey, new Map());
        const dateMap = byDate.get(dateKey)!;
        dateMap.set(name, (dateMap.get(name) || 0) + money);
    });

    const dates = [...byDate.keys()].sort();
    if (dates.length === 0) return null;

    const series = topRows.map((row) => ({
        name: row.name,
        color: row.color,
        values: dates.map((date) => byDate.get(date)?.get(row.name) || 0),
    }));
    const maxY = Math.max(1, ...series.flatMap((line) => line.values));
    return { dates, series, maxY };
}, [showSums, stripTab, dashboardTotalItems, stripDiagramBySender, stripDiagramByReceiver, stripDiagramByCustomer]);

const selectedChartConfig = useMemo(() => {
    let data: DashboardChartPoint[] = [];
    let title = "Динамика";
    let color = "#6366f1";
    let formatValue: (val: number) => string = (val) => `${Math.round(val).toLocaleString('ru-RU')}`;
    switch (chartType) {
        case 'money':
            data = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.sum) }));
            title = "Динамика в деньгах";
            color = "#6366f1";
            formatValue = (val) => `${Math.round(val).toLocaleString('ru-RU')} ₽`;
            break;
        case 'paidWeight':
            data = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.pw) }));
            title = "Динамика в платном весе";
            color = "#10b981";
            formatValue = (val) => `${Math.round(val)} кг`;
            break;
        case 'weight':
            data = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.w) }));
            title = "Динамика по весу";
            color = "#0d9488";
            formatValue = (val) => `${Math.round(val)} кг`;
            break;
        case 'volume':
            data = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: d.vol }));
            title = "Динамика по объёму";
            color = "#f59e0b";
            formatValue = (val) => `${val.toFixed(2)} м³`;
            break;
        case 'pieces':
            data = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.mest) }));
            title = "Динамика по местам (шт)";
            color = "#8b5cf6";
            formatValue = (val) => `${Math.round(val)} шт`;
            break;
    }
    return { data, title, color, formatValue };
}, [chartData, chartType]);

useLayoutEffect(() => {
    if (!WIDGET_3_CHART || showOnlySla || !showSums) return;
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
}, [WIDGET_3_CHART, showOnlySla, showSums, loading, error, chartData.length, chartType]);

const formatStripValue = (): string => {
    if (chartType === 'money') return `${Math.round(stripTotals.sum || 0).toLocaleString('ru-RU')} ₽`;
    if (chartType === 'paidWeight') return `${Math.round(stripTotals.pw || 0).toLocaleString('ru-RU')} кг`;
    if (chartType === 'weight') return `${Math.round(stripTotals.w || 0).toLocaleString('ru-RU')} кг`;
    if (chartType === 'pieces') return `${Math.round(stripTotals.mest || 0).toLocaleString('ru-RU')} шт`;
    const vol = Number(stripTotals.vol);
    return `${(isNaN(vol) ? 0 : vol).toFixed(2).replace('.', ',')} м³`;
};

const formatStripDelta = (delta: number): string => {
    if (chartType === 'money') {
        const formatted = formatCurrency(delta, true);
        return delta > 0 && !formatted.startsWith('+') ? `+${formatted}` : formatted;
    }
    if (chartType === 'paidWeight' || chartType === 'weight') {
        const n = Math.round(delta);
        return `${n >= 0 ? '+' : ''}${n.toLocaleString('ru-RU')} кг`;
    }
    if (chartType === 'pieces') {
        const n = Math.round(delta);
        return `${n >= 0 ? '+' : ''}${n.toLocaleString('ru-RU')} шт`;
    }
    const vol = Number(delta);
    const abs = isNaN(vol) ? 0 : Math.abs(vol);
    return `${delta >= 0 ? '+' : '−'}${abs.toFixed(2).replace('.', ',')} м³`;
};

/** Тренд период к периоду: текущий период vs предыдущий период (только в служебном режиме) */
const periodToPeriodTrend = useMemo(() => {
    if (!useServiceRequest || dashboardTotalPrevPeriodItems.length === 0) return null;
    
    const getVal = (item: CargoItem) => {
        if (chartType === 'money') return typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        if (chartType === 'paidWeight') return typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        if (chartType === 'weight') return typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
        if (chartType === 'pieces') return typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        return typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
    };
    
    const currentVal = dashboardTotalItems.reduce((acc, item) => acc + getVal(item), 0);
    const prevVal = dashboardTotalPrevPeriodItems.reduce((acc, item) => acc + getVal(item), 0);
    const delta = currentVal - prevVal;
    
    if (prevVal === 0) return currentVal > 0 ? { direction: 'up' as const, percent: 100, delta } : null;
    
    const percent = Math.round((delta / prevVal) * 100);
    return {
        direction: currentVal > prevVal ? 'up' as const : currentVal < prevVal ? 'down' as const : null,
        percent: Math.abs(percent),
        delta,
    };
}, [useServiceRequest, dashboardTotalItems, dashboardTotalPrevPeriodItems, chartType]);

/** Тренд по выбранной метрике: первая половина периода vs вторая половина */
const stripTrend = useMemo(() => {
    if (chartData.length < 4) return null;
    const mid = Math.floor(chartData.length / 2);
    const firstHalf = chartData.slice(0, mid);
    const secondHalf = chartData.slice(mid);
    const getVal = (d: { sum: number; pw: number; w: number; mest: number; vol: number }) => {
        if (chartType === 'money') return d.sum;
        if (chartType === 'paidWeight') return d.pw;
        if (chartType === 'weight') return d.w;
        if (chartType === 'pieces') return d.mest;
        return d.vol;
    };
    const v1 = firstHalf.reduce((acc, d) => acc + getVal(d), 0);
    const v2 = secondHalf.reduce((acc, d) => acc + getVal(d), 0);
    if (v2 > v1) return 'up';
    if (v2 < v1) return 'down';
    return null;
}, [chartData, chartType]);


    return {
        chartData,
        stripTotals,
        getValForChart,
        deliveryFilteredItems,
        deliveryStripTotals,
        deliveryStripDiagramByType,
        deliveryStripDiagramBySender,
        deliveryStripDiagramByReceiver,
        stripDiagramByType,
        stripDiagramBySender,
        stripDiagramByReceiver,
        stripDiagramByCustomer,
        stripLineChartData,
        selectedChartConfig,
        formatStripValue,
        formatStripDelta,
        periodToPeriodTrend,
        stripTrend,
    };
}

export type DashboardStripMetricsState = ReturnType<typeof useDashboardStripMetrics>;
