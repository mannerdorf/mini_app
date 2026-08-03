import { useMemo } from "react";
import * as dateUtils from "../../../lib/dateUtils";
import { getFilterKeyByStatus, getPaymentFilterKey } from "../../../lib/statusUtils";
import { stripOoo } from "../../../lib/formatUtils";
import { isFerry } from "../../../lib/cargoUtils";
import { getActualDeliveryDate } from "./dashboardCargoDateHelpers";
import type { DashboardChartPoint } from "../dashboardTypes";
import type { CargoItem } from "../../../types";

const { isDateInRange } = dateUtils;
const DIAGRAM_COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#3b82f6', '#ef4444', '#84cc16'];

export type UseDashboardAnalyticsParams = {
    useServiceRequest: boolean;
    dashboardTotalItems: CargoItem[];
    dashboardTotalPrevPeriodItems: CargoItem[];
    deliveryFactItems: CargoItem[];
    apiDateRange: { dateFrom: string; dateTo: string };
    heatmapMonth: { year: number; month: number };
    chartData: DashboardChartPoint[];
    maChartType: "money" | "paidWeight" | "weight" | "volume" | "pieces";
    weekdayDistributionMode: "received" | "issued";
    loading: boolean;
    deliveryFactLookupLoading: boolean;
};

export function useDashboardAnalytics({
    useServiceRequest,
    dashboardTotalItems,
    dashboardTotalPrevPeriodItems,
    deliveryFactItems,
    apiDateRange,
    heatmapMonth,
    chartData,
    maChartType,
    weekdayDistributionMode,
    loading,
    deliveryFactLookupLoading,
    }: UseDashboardAnalyticsParams) {
    const statusFunnel = useMemo(() => {
    if (!useServiceRequest) return [];
    const stages: { key: string; label: string; color: string }[] = [
        { key: 'accepted', label: 'Принят', color: '#3b82f6' },
        { key: 'transit', label: 'В пути', color: '#f59e0b' },
        { key: 'ready', label: 'Готов к выдаче', color: '#8b5cf6' },
        { key: 'delivering', label: 'На доставке', color: '#06b6d4' },
        { key: 'delivered', label: 'Доставлен', color: '#10b981' },
    ];
    const counts = new Map<string, number>();
    dashboardTotalItems.forEach((item) => {
        const k = getFilterKeyByStatus(item.State);
        counts.set(k, (counts.get(k) || 0) + 1);
    });
    return stages.map((s) => ({ ...s, count: counts.get(s.key) || 0 }));
    }, [dashboardTotalItems, useServiceRequest]);
    
    type FunnelCustomerRow = { customer: string; count: number; sum: number };
    const statusFunnelCustomersTable = useMemo(() => {
    if (!useServiceRequest) return {} as Record<string, FunnelCustomerRow[]>;
    const byStatus = new Map<string, Map<string, { count: number; sum: number }>>();
    dashboardTotalItems.forEach((item) => {
        const statusKey = getFilterKeyByStatus(item.State);
        const customer = stripOoo((item.Customer ?? (item as any).customer ?? '').trim() || '—');
        const sumVal = typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum ?? 0);
        if (!byStatus.has(statusKey)) byStatus.set(statusKey, new Map());
        const custMap = byStatus.get(statusKey)!;
        const cur = custMap.get(customer) ?? { count: 0, sum: 0 };
        custMap.set(customer, { count: cur.count + 1, sum: cur.sum + sumVal });
    });
    const result: Record<string, FunnelCustomerRow[]> = {};
    byStatus.forEach((custMap, key) => {
        result[key] = [...custMap.entries()]
            .map(([customer, { count, sum }]) => ({ customer, count, sum }))
            .sort((a, b) => b.count - a.count);
    });
    return result;
    }, [dashboardTotalItems, useServiceRequest]);
    
    /** Перевозки по (статус, заказчик) для раскрытия при клике */
    const statusFunnelItemsByCustomer = useMemo(() => {
    if (!useServiceRequest) return {} as Record<string, Record<string, any[]>>;
    const result: Record<string, Record<string, any[]>> = {};
    dashboardTotalItems.forEach((item) => {
        const statusKey = getFilterKeyByStatus(item.State);
        const customer = stripOoo((item.Customer ?? (item as any).customer ?? '').trim() || '—');
        if (!result[statusKey]) result[statusKey] = {};
        if (!result[statusKey][customer]) result[statusKey][customer] = [];
        result[statusKey][customer].push(item);
    });
    return result;
    }, [dashboardTotalItems, useServiceRequest]);
    
    const paretoByCustomer = useMemo(() => {
    if (!useServiceRequest) return { rows: [] as { name: string; value: number; cumPercent: number; color: string }[], total: 0 };
    const map = new Map<string, number>();
    dashboardTotalItems.forEach((item) => {
        const name = stripOoo((item.Customer ?? (item as any).customer ?? '').trim() || '—');
        const val = typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        map.set(name, (map.get(name) || 0) + val);
    });
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    let cum = 0;
    const rows = sorted.map(([name, value], i) => {
        cum += value;
        return { name, value, cumPercent: Math.round((cum / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length] };
    });
    return { rows, total };
}, [dashboardTotalItems, useServiceRequest]);

const heatmapRange = useMemo(() => {
    const from = dateUtils.parseDateOnly(apiDateRange.dateFrom);
    const to = dateUtils.parseDateOnly(apiDateRange.dateTo);
    if (!from || !to) return { minYear: 0, minMonth: 0, maxYear: 0, maxMonth: 0 };
    return { minYear: from.getFullYear(), minMonth: from.getMonth() + 1, maxYear: to.getFullYear(), maxMonth: to.getMonth() + 1 };
}, [apiDateRange]);

const loadHeatmap = useMemo(() => {
    if (!useServiceRequest) return { cells: [] as { key: string; day: number; count: number; pw: number }[], maxCount: 1, year: 0, month: 0 };
    const { year, month } = heatmapMonth;
    const lastDay = new Date(year, month, 0).getDate();
    const cells: { key: string; day: number; count: number; pw: number }[] = [];
    const byDay = new Map<string, { count: number; pw: number }>();
    let _dbgTotal = 0, _dbgNoDate = 0, _dbgRecv = 0, _dbgParseFail = 0, _dbgMonthMiss = 0, _dbgOk = 0;
    const _dbgSamples: string[] = [];
    dashboardTotalItems.forEach((item) => {
        _dbgTotal++;
        const raw = String(item.DatePrih ?? '').trim();
        if (!raw) { _dbgNoDate++; return; }
        if (_dbgSamples.length < 5) _dbgSamples.push(raw);
        const p = dateUtils.parseDateOnly(raw);
        if (!p) { _dbgParseFail++; return; }
        if (p.getFullYear() !== year || p.getMonth() + 1 !== month) { _dbgMonthMiss++; return; }
        _dbgOk++;
        const dayKey = `${year}-${String(month).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
        const entry = byDay.get(dayKey) || { count: 0, pw: 0 };
        entry.count += 1;
        entry.pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        byDay.set(dayKey, entry);
    });
    let maxCount = 1;
    for (let d = 1; d <= lastDay; d++) {
        const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const entry = byDay.get(key) || { count: 0, pw: 0 };
        if (entry.count > maxCount) maxCount = entry.count;
        cells.push({ key, day: d, count: entry.count, pw: entry.pw });
    }
    console.log('[HEATMAP DEBUG]', { year, month, _dbgTotal, _dbgRecv, _dbgNoDate, _dbgParseFail, _dbgMonthMiss, _dbgOk, _dbgSamples, byDaySize: byDay.size });
    return { cells, maxCount, year, month };
}, [dashboardTotalItems, useServiceRequest, heatmapMonth]);

const movingAverage7 = useMemo(() => {
    if (!useServiceRequest || chartData.length < 3) return null;
    const getVal = (d: { sum: number; pw: number; w: number; mest: number; vol: number }) => {
        if (maChartType === 'money') return d.sum;
        if (maChartType === 'paidWeight') return d.pw;
        if (maChartType === 'weight') return d.w;
        if (maChartType === 'pieces') return d.mest;
        return d.vol;
    };
    const values = chartData.map(getVal);
    const window = Math.min(7, values.length);
    const ma: { date: string; dateKey?: string; value: number }[] = [];
    for (let i = 0; i < values.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = values.slice(start, i + 1);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        ma.push({ date: chartData[i].date, dateKey: (chartData[i] as any).dateKey, value: Math.round(avg) });
    }
    return ma;
}, [chartData, maChartType, useServiceRequest]);
const repeatCustomers = useMemo(() => {
    if (!useServiceRequest || dashboardTotalPrevPeriodItems.length === 0) return null;
    const current = new Set<string>();
    const previous = new Set<string>();
    dashboardTotalItems.forEach((item) => {
        const name = (item.Customer ?? (item as any).customer ?? '').trim();
        if (name) current.add(name);
    });
    dashboardTotalPrevPeriodItems.forEach((item) => {
        const name = (item.Customer ?? (item as any).customer ?? '').trim();
        if (name) previous.add(name);
    });
    let repeat = 0;
    let newC = 0;
    const repeatList: string[] = [];
    const newList: string[] = [];
    current.forEach((name) => {
        if (previous.has(name)) {
            repeat += 1;
            repeatList.push(name);
        } else {
            newC += 1;
            newList.push(name);
        }
    });
    const allList = [...current].sort((a, b) => a.localeCompare(b, "ru"));
    repeatList.sort((a, b) => a.localeCompare(b, "ru"));
    newList.sort((a, b) => a.localeCompare(b, "ru"));
    return {
        total: current.size,
        repeat,
        new: newC,
        repeatPercent: current.size > 0 ? Math.round((repeat / current.size) * 100) : 0,
        allList,
        repeatList,
        newList,
    };
}, [dashboardTotalItems, dashboardTotalPrevPeriodItems, useServiceRequest]);

const weekdayDistribution = useMemo(() => {
    if (!useServiceRequest) return [];
    const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const ferry = [0, 0, 0, 0, 0, 0, 0];
    const auto = [0, 0, 0, 0, 0, 0, 0];
    const weights = [0, 0, 0, 0, 0, 0, 0];
    const sourceItems = weekdayDistributionMode === "issued" ? deliveryFactItems : dashboardTotalItems;
    sourceItems.forEach((item) => {
        let p: Date | null = null;
        if (weekdayDistributionMode === "received") {
            const raw = String(item.DatePrih ?? "").trim();
            if (!raw) return;
            const dk = raw.includes("T") ? raw.split("T")[0] : raw;
            if (!isDateInRange(dk, apiDateRange.dateFrom, apiDateRange.dateTo)) return;
            p = dateUtils.parseDateOnly(dk);
        } else {
            const act = getActualDeliveryDate(item);
            if (!act) return;
            const key = `${act.getFullYear()}-${String(act.getMonth() + 1).padStart(2, "0")}-${String(act.getDate()).padStart(2, "0")}`;
            if (!isDateInRange(key, apiDateRange.dateFrom, apiDateRange.dateTo)) return;
            p = act;
        }
        if (!p) return;
        const dow = (p.getDay() + 6) % 7;
        if (isFerry(item)) ferry[dow] += 1;
        else auto[dow] += 1;
        weights[dow] += typeof item.PW === "string" ? parseFloat(item.PW) || 0 : (item.PW || 0);
    });
    const maxCount = Math.max(...ferry.map((f, i) => f + auto[i]), 1);
    return DAYS.map((label, i) => ({
        label,
        count: ferry[i] + auto[i],
        ferry: ferry[i],
        auto: auto[i],
        pw: weights[i],
        percent: Math.round(((ferry[i] + auto[i]) / maxCount) * 100),
        ferryPct: Math.round((ferry[i] / maxCount) * 100),
        autoPct: Math.round((auto[i] / maxCount) * 100),
    }));
}, [dashboardTotalItems, deliveryFactItems, useServiceRequest, weekdayDistributionMode, getActualDeliveryDate, apiDateRange.dateFrom, apiDateRange.dateTo]);
const weekdayDistributionLoading = loading || (weekdayDistributionMode === "issued" && deliveryFactLookupLoading);
const clientItems = useMemo(() => dashboardTotalItems, [dashboardTotalItems]);
const getCustomerName = (item: any) => (item.Customer ?? item.customer ?? '').trim();
const getItemDate = (item: any): Date | null => dateUtils.parseDateOnly(String(item.DatePrih ?? '').trim());
const getItemSum = (item: any) => typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
const getItemPw = (item: any) => typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
const customerLtv = useMemo(() => {
    if (!useServiceRequest || clientItems.length === 0) return null;
    const byCustomer = new Map<string, { sum: number; pw: number; count: number; first: Date | null; last: Date | null }>();
    clientItems.forEach(item => {
        const name = getCustomerName(item);
        if (!name) return;
        const d = getItemDate(item);
        const entry = byCustomer.get(name) || { sum: 0, pw: 0, count: 0, first: null, last: null };
        entry.sum += getItemSum(item);
        entry.pw += getItemPw(item);
        entry.count += 1;
        if (d) {
            if (!entry.first || d < entry.first) entry.first = d;
            if (!entry.last || d > entry.last) entry.last = d;
        }
        byCustomer.set(name, entry);
    });
    const list = [...byCustomer.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sum - a.sum);
    const totalLtv = list.reduce((a, b) => a + b.sum, 0);
    const avgLtv = list.length > 0 ? totalLtv / list.length : 0;
    return { top10: list.slice(0, 10), avgLtv, totalCustomers: list.length };
}, [clientItems, useServiceRequest]);

const rfmSegments = useMemo(() => {
    if (!useServiceRequest || clientItems.length === 0) return null;
    const byCustomer = new Map<string, { dates: Date[]; sum: number; count: number }>();
    clientItems.forEach(item => {
        const name = getCustomerName(item);
        if (!name) return;
        const d = getItemDate(item);
        const entry = byCustomer.get(name) || { dates: [], sum: 0, count: 0 };
        entry.sum += getItemSum(item);
        entry.count += 1;
        if (d) entry.dates.push(d);
        byCustomer.set(name, entry);
    });
    const now = new Date();
    const scores: { name: string; recency: number; frequency: number; monetary: number; rScore: number; fScore: number; mScore: number; segment: string }[] = [];
    const allR: number[] = [], allF: number[] = [], allM: number[] = [];
    byCustomer.forEach((v, name) => {
        const lastDate = v.dates.length > 0 ? Math.max(...v.dates.map(d => d.getTime())) : 0;
        const recency = lastDate ? Math.round((now.getTime() - lastDate) / 86400000) : 999;
        allR.push(recency); allF.push(v.count); allM.push(v.sum);
        scores.push({ name, recency, frequency: v.count, monetary: v.sum, rScore: 0, fScore: 0, mScore: 0, segment: '' });
    });
    const quantile = (arr: number[], q: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * q)] || 0; };
    const rQ = [quantile(allR, 0.25), quantile(allR, 0.5), quantile(allR, 0.75)];
    const fQ = [quantile(allF, 0.25), quantile(allF, 0.5), quantile(allF, 0.75)];
    const mQ = [quantile(allM, 0.25), quantile(allM, 0.5), quantile(allM, 0.75)];
    const score = (val: number, qs: number[], invert?: boolean) => {
        if (invert) return val <= qs[0] ? 4 : val <= qs[1] ? 3 : val <= qs[2] ? 2 : 1;
        return val >= qs[2] ? 4 : val >= qs[1] ? 3 : val >= qs[0] ? 2 : 1;
    };
    const segmentName = (r: number, f: number, m: number) => {
        if (r >= 3 && f >= 3 && m >= 3) return 'Чемпионы';
        if (r >= 3 && f >= 2) return 'Лояльные';
        if (r >= 3 && f === 1) return 'Новички';
        if (r === 2 && f >= 2) return 'Перспективные';
        if (r === 2 && f === 1) return 'Нуждаются во внимании';
        if (r === 1 && f >= 3) return 'Спящие';
        if (r === 1 && f >= 1 && m >= 2) return 'Под угрозой';
        return 'Потерянные';
    };
    scores.forEach(s => {
        s.rScore = score(s.recency, rQ, true);
        s.fScore = score(s.frequency, fQ);
        s.mScore = score(s.monetary, mQ);
        s.segment = segmentName(s.rScore, s.fScore, s.mScore);
    });
    const segments = new Map<string, { count: number; avgSum: number; totalSum: number; color: string }>();
    const segColors: Record<string, string> = {
        'Чемпионы': '#10b981', 'Лояльные': '#22c55e', 'Новички': '#3b82f6',
        'Перспективные': '#06b6d4', 'Нуждаются во внимании': '#f59e0b',
        'Спящие': '#f97316', 'Под угрозой': '#ef4444', 'Потерянные': '#94a3b8',
    };
    scores.forEach(s => {
        const e = segments.get(s.segment) || { count: 0, avgSum: 0, totalSum: 0, color: segColors[s.segment] || '#6b7280' };
        e.count += 1;
        e.totalSum += s.monetary;
        segments.set(s.segment, e);
    });
    segments.forEach(v => { v.avgSum = v.count > 0 ? v.totalSum / v.count : 0; });
    const segList = [...segments.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
    const customersBySegment: Record<string, { name: string; monetary: number }[]> = {};
    scores.forEach(s => {
        if (!customersBySegment[s.segment]) customersBySegment[s.segment] = [];
        customersBySegment[s.segment].push({ name: s.name, monetary: s.monetary });
    });
    Object.keys(customersBySegment).forEach(seg => customersBySegment[seg].sort((a, b) => b.monetary - a.monetary));
    return { segments: segList, total: scores.length, customersBySegment };
}, [clientItems, useServiceRequest]);

const paymentDiscipline = useMemo(() => {
    if (!useServiceRequest || clientItems.length === 0) return null;
    const byCustomer = new Map<string, { totalDelay: number; count: number; paid: number; unpaid: number }>();
    clientItems.forEach(item => {
        const name = getCustomerName(item);
        if (!name) return;
        const entry = byCustomer.get(name) || { totalDelay: 0, count: 0, paid: 0, unpaid: 0 };
        entry.count += 1;
        const billKey = getPaymentFilterKey(item.StateBill);
        if (billKey === 'paid') entry.paid += 1;
        else entry.unpaid += 1;
        const datePrih = getItemDate(item);
        const dateVr = dateUtils.parseDateOnly(String(item.DateVr ?? '').trim());
        if (datePrih && dateVr && dateVr > datePrih) {
            entry.totalDelay += Math.round((dateVr.getTime() - datePrih.getTime()) / 86400000);
        }
        byCustomer.set(name, entry);
    });
    const list = [...byCustomer.entries()].map(([name, v]) => ({
        name, avgDelay: v.count > 0 ? Math.round(v.totalDelay / v.count) : 0,
        paidRate: v.count > 0 ? Math.round((v.paid / v.count) * 100) : 0,
        count: v.count, paid: v.paid, unpaid: v.unpaid,
    })).sort((a, b) => a.paidRate - b.paidRate);
    return list;
}, [clientItems, useServiceRequest]);

const customerMargin = useMemo(() => {
    if (!useServiceRequest || clientItems.length === 0) return null;
    const byCustomer = new Map<string, { sum: number; pw: number; count: number }>();
    clientItems.forEach(item => {
        const name = getCustomerName(item);
        if (!name) return;
        const entry = byCustomer.get(name) || { sum: 0, pw: 0, count: 0 };
        entry.sum += getItemSum(item);
        entry.pw += getItemPw(item);
        entry.count += 1;
        byCustomer.set(name, entry);
    });
    return [...byCustomer.entries()]
        .map(([name, v]) => ({ name, sum: v.sum, pw: v.pw, count: v.count, perKg: v.pw > 0 ? v.sum / v.pw : 0 }))
        .sort((a, b) => b.sum - a.sum);
}, [clientItems, useServiceRequest]);

const clientSeasonality = useMemo(() => {
    if (!useServiceRequest || clientItems.length === 0) return null;
    const data = new Map<string, number[]>();
    clientItems.forEach(item => {
        const name = getCustomerName(item);
        if (!name) return;
        const d = getItemDate(item);
        if (!d) return;
        if (!data.has(name)) data.set(name, Array(12).fill(0));
        data.get(name)![d.getMonth()] += 1;
    });
    const list = [...data.entries()].map(([name, months]) => ({ name, months, total: months.reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total).slice(0, 15);
    const maxVal = Math.max(...list.flatMap(r => r.months), 1);
    return { rows: list, maxVal };
}, [clientItems, useServiceRequest]);

const avgCheckTrend = useMemo(() => {
    if (!useServiceRequest || clientItems.length === 0) return null;
    const byMonth = new Map<string, { sum: number; pw: number; count: number }>();
    clientItems.forEach(item => {
        const d = getItemDate(item);
        if (!d) return;
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const entry = byMonth.get(mk) || { sum: 0, pw: 0, count: 0 };
        entry.sum += getItemSum(item);
        entry.pw += getItemPw(item);
        entry.count += 1;
        byMonth.set(mk, entry);
    });
    return [...byMonth.entries()].map(([month, v]) => ({
        month, avgSum: v.count > 0 ? Math.round(v.sum / v.count) : 0,
        avgPw: v.count > 0 ? Math.round(v.pw / v.count) : 0, count: v.count,
    })).sort((a, b) => a.month.localeCompare(b.month));
}, [clientItems, useServiceRequest]);

const deliveryPreferences = useMemo(() => {
    if (!useServiceRequest || clientItems.length === 0) return null;
    const byCustomer = new Map<string, { ferry: number; auto: number; total: number }>();
    clientItems.forEach(item => {
        const name = getCustomerName(item);
        if (!name) return;
        const entry = byCustomer.get(name) || { ferry: 0, auto: 0, total: 0 };
        if (isFerry(item)) entry.ferry += 1; else entry.auto += 1;
        entry.total += 1;
        byCustomer.set(name, entry);
    });
    return [...byCustomer.entries()]
        .map(([name, v]) => ({ name, ...v, ferryPct: Math.round((v.ferry / v.total) * 100) }))
        .sort((a, b) => b.total - a.total).slice(0, 15);
}, [clientItems, useServiceRequest]);


    return {
        statusFunnel,
        statusFunnelCustomersTable,
        statusFunnelItemsByCustomer,
        paretoByCustomer,
        heatmapRange,
        loadHeatmap,
        movingAverage7,
        repeatCustomers,
        weekdayDistribution,
        weekdayDistributionLoading,
        clientItems,
        getItemSum,
        customerLtv,
        rfmSegments,
        paymentDiscipline,
        customerMargin,
        clientSeasonality,
        avgCheckTrend,
        deliveryPreferences,
    };
}

export type DashboardAnalyticsState = ReturnType<typeof useDashboardAnalytics>;
