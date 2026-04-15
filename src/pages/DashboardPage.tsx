/**
 * Секретный дашборд: виджеты перевозок, SLA, платёжный календарь, таймшит.
 */
import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import {
    Loader2, X, ChevronDown, Calendar, Filter, Package, Scale, Weight, Maximize, CreditCard, Check,
    AlertTriangle, Info, Ship, Truck, ArrowDown, ArrowUp, ArrowLeft, TrendingUp, TrendingDown, Minus, RussianRuble, List, RefreshCw,
} from "lucide-react";
import { Button, Flex, Grid, Input, Panel, Typography } from "@maxhub/max-ui";
import * as dateUtils from "../lib/dateUtils";
import {
    getFilterKeyByStatus,
    getPaymentFilterKey,
    isReceivedInfoStatus,
    BILL_STATUS_MAP,
    STATUS_MAP,
} from "../lib/statusUtils";
import type { BillStatusFilterKey } from "../lib/statusUtils";
import { normalizeStatus } from "../lib/statusUtils";
import { workingDaysBetween, workingDaysInPlan, type WorkSchedule } from "../lib/slaWorkSchedule";
import { getSlaInfo, getPlanDays, getInnFromCargo, isFerry } from "../lib/cargoUtils";
import { formatCurrency, formatInvoiceNumber, stripOoo, cityToCode, normalizeInvoiceStatus } from "../lib/formatUtils";
import { getFirstCargoNumberFromInvoice, buildCargoStateByNumber } from "./documentsPipeline";
import { usePerevozki, usePrevPeriodPerevozki, useInvoices } from "../hooks/useApi";
import { fetchPerevozkaTimeline } from "../lib/perevozkaDetails";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { DateText } from "../components/ui/DateText";
import { FilterDialog } from "../components/shared/FilterDialog";
import { CustomPeriodModal } from "../components/modals/CustomPeriodModal";
import { getWebApp, isMaxWebApp } from "../webApp";
import type { AuthData, CargoItem, DateFilter, PerevozkaTimelineStep, StatusFilter } from "../types";

const {
    DEFAULT_DATE_FROM,
    DEFAULT_DATE_TO,
    getDateRange,
    getPreviousPeriodRange,
    getWeekRange,
    getYearsList,
    getWeeksList,
    formatDate,
    formatTimelineDate,
    formatTimelineTime,
    getDateTextColor,
    getFirstWorkingDayOnOrAfter,
    getFirstPaymentWeekdayOnOrAfter,
    isDateInRange,
} = dateUtils;
const MONTH_NAMES = dateUtils.MONTH_NAMES;

const DASHBOARD_MOTION_CONTAINER = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.055, delayChildren: 0.05 },
    },
};

const DASHBOARD_MOTION_ITEM = {
    hidden: { opacity: 0, y: 14 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: "spring", stiffness: 380, damping: 30 },
    },
};

function DashboardMotionGroup({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
    if (!enabled) return <>{children}</>;
    return (
        <MotionConfig reduced="user">
            <motion.div
                variants={DASHBOARD_MOTION_CONTAINER}
                initial="hidden"
                animate="visible"
                style={{ display: "flex", flexDirection: "column", width: "100%", gap: 0 }}
            >
                {children}
            </motion.div>
        </MotionConfig>
    );
}

function DashboardMotionItem({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
    if (!enabled) return <>{children}</>;
    return (
        <motion.div variants={DASHBOARD_MOTION_ITEM} style={{ width: "100%" }}>
            {children}
        </motion.div>
    );
}

const CHART_BAR_FILL_DURATION = 0.72;
const CHART_BAR_FILL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Горизонтальная полоса: ширина 0% → целевая (наполнение при монтировании). */
function DashboardChartBarH({
    enabled,
    widthPercent,
    delay = 0,
    style,
    title,
}: {
    enabled: boolean;
    widthPercent: number;
    delay?: number;
    style?: React.CSSProperties;
    title?: string;
}) {
    const w = Math.max(0, Math.min(100, Number.isFinite(widthPercent) ? widthPercent : 0));
    if (!enabled) {
        return <div title={title} style={{ height: "100%", width: `${w}%`, boxSizing: "border-box", ...style }} />;
    }
    return (
        <motion.div
            title={title}
            initial={{ width: "0%" }}
            animate={{ width: `${w}%` }}
            transition={{ duration: CHART_BAR_FILL_DURATION, ease: CHART_BAR_FILL_EASE, delay }}
            style={{ height: "100%", boxSizing: "border-box", ...style }}
        />
    );
}

/** Высота столбца в px (мини-графики). */
function DashboardChartBarPixelHeight({
    enabled,
    heightPx,
    delay = 0,
    style,
}: {
    enabled: boolean;
    heightPx: number;
    delay?: number;
    style?: React.CSSProperties;
}) {
    const h = Math.max(0, Math.round(heightPx));
    if (!enabled) {
        return <div style={{ width: "100%", height: Math.max(h, 2), ...style }} />;
    }
    return (
        <motion.div
            initial={{ height: 0 }}
            animate={{ height: Math.max(h, 2) }}
            transition={{ duration: CHART_BAR_FILL_DURATION, ease: CHART_BAR_FILL_EASE, delay }}
            style={{ width: "100%", boxSizing: "border-box", overflow: "hidden", ...style }}
        />
    );
}

export type DashboardPageProps = {
    auth: AuthData;
    onClose: () => void;
    onOpenCargoFilters: (filters: { status?: StatusFilter; search?: string }) => void;
    showSums?: boolean;
    useServiceRequest?: boolean;
    hasAnalytics?: boolean;
    hasDashboard?: boolean;
    /** Stagger + spring по блокам (только при глобальном SaaS-стиле). */
    saasDashboardMotion?: boolean;
};

export function DashboardPage({
    auth,
    onClose,
    onOpenCargoFilters,
    showSums = true,
    useServiceRequest = false,
    hasAnalytics = false,
    hasDashboard = true,
    saasDashboardMotion = false,
}: DashboardPageProps) {
    const prefersReducedMotion = useReducedMotion();
    const dashboardMotionEnabled = !!saasDashboardMotion && prefersReducedMotion !== true;
    /** Наполнение полос графиков — для всех, кроме prefers-reduced-motion. */
    const chartBarFillEnabled = prefersReducedMotion !== true;
    const normalizeTimelineErrorMessage = (message?: string | null) => {
        const raw = String(message || "").trim();
        if (!raw) return "Не удалось загрузить статусы";
        const lower = raw.toLowerCase();
        if (lower.includes("перевозка не найдена") || lower.includes("not found")) {
            return "Нет статусов по этой перевозке";
        }
        return raw;
    };
    const isVisibilityDeniedError = (message?: string | null) => {
        const raw = String(message || "").trim().toLowerCase();
        if (!raw) return false;
        return raw.includes("доступ") || raw.includes("недостаточно прав") || raw.includes("только для");
    };
    // Календарь по выбранному заказчику доступен при dashboard=true.
    // Сводный календарь по всей компании (service mode) — только при analytics=true.
    const showPaymentCalendar = hasDashboard && (!useServiceRequest || hasAnalytics);
    const canViewTimesheetCostDashboard = hasAnalytics;
    const [debugInfo, setDebugInfo] = useState<string>("");
    // Если отключены дашборды правом dashboard — оставляем только SLA.
    const showOnlySla = !hasDashboard;
    const WIDGET_1_FILTERS = !showOnlySla;
    const WIDGET_2_STRIP = !showOnlySla;
    const WIDGET_3_CHART = !showOnlySla;
    const WIDGET_4_SLA = true;
    const WIDGET_5_PAYMENT_CALENDAR = !showOnlySla;

    // Filters State (для Главной храним отдельно от Документов/Грузов)
    const DASHBOARD_DATE_FILTER_STORAGE_KEY = "haulz.dashboard.dateFilterState";
    const initDate = () => {
        try {
            const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DASHBOARD_DATE_FILTER_STORAGE_KEY) : null;
            return raw
                ? JSON.parse(raw) as {
                    dateFilter?: DateFilter;
                    customDateFrom?: string;
                    customDateTo?: string;
                    selectedMonthForFilter?: { year: number; month: number } | null;
                    selectedYearForFilter?: number | null;
                    selectedWeekForFilter?: string | null;
                }
                : null;
        } catch {
            return null;
        }
    };
    const [dateFilter, setDateFilter] = useState<DateFilter>(() => initDate()?.dateFilter ?? "месяц");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(() => initDate()?.customDateFrom ?? DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(() => initDate()?.customDateTo ?? DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months' | 'years' | 'weeks'>('main');
    const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(() => initDate()?.selectedMonthForFilter ?? null);
    const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(() => initDate()?.selectedYearForFilter ?? null);
    const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(() => initDate()?.selectedWeekForFilter ?? null);
    useEffect(() => {
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(
                    DASHBOARD_DATE_FILTER_STORAGE_KEY,
                    JSON.stringify({ dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter })
                );
            }
        } catch {
            // ignore
        }
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const yearWasLongPressRef = useRef(false);
    const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const weekWasLongPressRef = useRef(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [senderFilter, setSenderFilter] = useState<string>('');
    const [receiverFilter, setReceiverFilter] = useState<string>('');
    const [billStatusFilter, setBillStatusFilter] = useState<BillStatusFilterKey>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'ferry' | 'auto'>('all');
    const [routeFilter, setRouteFilter] = useState<'all' | 'MSK-KGD' | 'KGD-MSK'>('all');
    const [isSenderDropdownOpen, setIsSenderDropdownOpen] = useState(false);
    const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
    const [isBillStatusDropdownOpen, setIsBillStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const dateButtonRef = useRef<HTMLDivElement>(null);
    const statusButtonRef = useRef<HTMLDivElement>(null);
    const senderButtonRef = useRef<HTMLDivElement>(null);
    const receiverButtonRef = useRef<HTMLDivElement>(null);
    const billStatusButtonRef = useRef<HTMLDivElement>(null);
    const typeButtonRef = useRef<HTMLDivElement>(null);
    const mainChartWrapRef = useRef<HTMLDivElement | null>(null);
    const [mainChartOuterWidthPx, setMainChartOuterWidthPx] = useState(800);
    const maChartWrapRef = useRef<HTMLDivElement | null>(null);
    const [maChartOuterWidthPx, setMaChartOuterWidthPx] = useState(800);
    const routeButtonRef = useRef<HTMLDivElement>(null);
    const [slaDetailsOpen, setSlaDetailsOpen] = useState(false);
    
    // Chart type selector: деньги / вес / объём (при !showSums доступны только вес и объём)
    const [chartType, setChartType] = useState<'money' | 'paidWeight' | 'weight' | 'volume' | 'pieces'>(() => (showSums ? 'money' : 'paidWeight'));
    const [mainChartVariant, setMainChartVariant] = useState<'columns' | 'line' | 'area' | 'combo' | 'dot'>('columns');
    const [stripTab, setStripTab] = useState<'type' | 'sender' | 'receiver' | 'customer'>('type');
    const [deliveryStripTab, setDeliveryStripTab] = useState<'type' | 'sender' | 'receiver'>('type');
    /** true = показывать проценты, false = показывать в рублях/кг/м³/шт (по типу графика) */
    const [stripShowAsPercent, setStripShowAsPercent] = useState(true);
    const [deliveryStripShowAsPercent, setDeliveryStripShowAsPercent] = useState(true);
    /** Раскрытая строка в таблице «Перевозки вне SLA»: по клику показываем статусы в виде таблицы */
    const [expandedSlaCargoNumber, setExpandedSlaCargoNumber] = useState<string | null>(null);
    const [expandedAgingBucket, setExpandedAgingBucket] = useState<string | null>(null);
    const [agingSortCol, setAgingSortCol] = useState<'number' | 'customer' | 'status' | 'shipmentStatus' | 'sum' | 'days'>('sum');
    const [agingSortAsc, setAgingSortAsc] = useState(false);
    /** Выбранная зона риска оттока: при клике на карточку показываем список клиентов этой зоны */
    const [churnRiskZone, setChurnRiskZone] = useState<'red' | 'yellow' | 'green'>('red');
    /** Сортировка таблицы «Риск оттока» */
    const [churnSortCol, setChurnSortCol] = useState<'name' | 'orders' | 'avgInterval' | 'daysSinceLast' | 'status'>('daysSinceLast');
    const [churnSortAsc, setChurnSortAsc] = useState(false);
    /** Раскрытый сегмент RFM: при клике показываем список заказчиков */
    const [expandedRfmSegment, setExpandedRfmSegment] = useState<string | null>(null);
    /** Список заказчиков для виджета "Повторные клиенты" */
    const [repeatCustomersListMode, setRepeatCustomersListMode] = useState<'all' | 'repeat' | 'new' | null>(null);
    /** Выбранная строка воронки статусов для показа заказчиков */
    const [selectedFunnelStatusKey, setSelectedFunnelStatusKey] = useState<string | null>(null);
    /** Раскрытый заказчик в таблице «Заказчики по статусу» — показываем перевозки и даты */
    const [expandedFunnelCustomer, setExpandedFunnelCustomer] = useState<string | null>(null);
    /** Сортировка таблицы «Платёжная дисциплина» */
    const [paymentDisciplineSortCol, setPaymentDisciplineSortCol] = useState<'name' | 'count' | 'paid' | 'unpaid' | 'paidRate'>('paidRate');
    const [paymentDisciplineSortAsc, setPaymentDisciplineSortAsc] = useState(true);
    const [maChartType, setMaChartType] = useState<'money' | 'paidWeight' | 'weight' | 'volume' | 'pieces'>('paidWeight');
    const [expandedSlaItem, setExpandedSlaItem] = useState<CargoItem | null>(null);
    const [slaTimelineSteps, setSlaTimelineSteps] = useState<PerevozkaTimelineStep[] | null>(null);
    const [slaTimelineLoading, setSlaTimelineLoading] = useState(false);
    const [slaTimelineError, setSlaTimelineError] = useState<string | null>(null);
    /** Сортировка таблицы «Перевозки вне SLA»: колонка и направление */
    const [slaTableSortColumn, setSlaTableSortColumn] = useState<string | null>(null);
    const [slaTableSortOrder, setSlaTableSortOrder] = useState<'asc' | 'desc'>('asc');
    /** Платёжный календарь: дни на оплату по ИНН (для hasAnalytics) */
    const [paymentCalendarByInn, setPaymentCalendarByInn] = useState<Record<string, { days_to_pay: number; payment_weekdays: number[] }>>({});
    /** Рабочие графики заказчиков (для SLA при статусах «Готов к выдаче» / «На доставке») */
    const [workScheduleByInn, setWorkScheduleByInn] = useState<Record<string, WorkSchedule>>({});
    const [paymentCalendarLoading, setPaymentCalendarLoading] = useState(false);
    const [paymentCalendarMonth, setPaymentCalendarMonth] = useState<{ year: number; month: number }>(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() + 1 };
    });
    const [paymentCalendarSelectedDate, setPaymentCalendarSelectedDate] = useState<string | null>(null);
    const [heatmapMonth, setHeatmapMonth] = useState<{ year: number; month: number }>(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() + 1 };
    });
    const [timesheetDashboardPeriod, setTimesheetDashboardPeriod] = useState<{ year: number; month: number }>(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() + 1 };
    });
    const [timesheetAnalyticsLoading, setTimesheetAnalyticsLoading] = useState(false);
    const [timesheetAnalyticsError, setTimesheetAnalyticsError] = useState<string | null>(null);
    const [timesheetPaidWeight, setTimesheetPaidWeight] = useState(0);
    const [timesheetAnalyticsData, setTimesheetAnalyticsData] = useState<{
        totalHours: number;
        totalShifts: number;
        totalCost: number;
        totalPaid: number;
        totalOutstanding: number;
        employees: Array<{
            employeeId: number;
            fullName: string;
            department: string;
            position: string;
            accrualType: "hour" | "shift" | "month";
            accrualRate: number;
            active?: boolean;
            totalHours: number;
            totalShifts: number;
            totalCost: number;
            totalPaid: number;
            totalOutstanding: number;
        }>;
    } | null>(null);
    const normalizeDashboardAccrualType = (value: unknown): "hour" | "shift" | "month" => {
        const raw = String(value ?? "").trim().toLowerCase();
        if (!raw) return "hour";
        if (raw === "month" || raw === "месяц" || raw === "monthly") return "month";
        if (raw === "shift" || raw === "смена") return "shift";
        if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
        if (raw.includes("month") || raw.includes("месяц")) return "month";
        return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
    };
    const normalizeDashboardShiftMark = (rawValue: string): "Я" | "ПР" | "Б" | "ОГ" | "ОТ" | "УВ" | "" => {
        const raw = String(rawValue || "").trim().toUpperCase();
        if (!raw) return "";
        if (raw === "Я") return "Я";
        if (raw === "ПР") return "ПР";
        if (raw === "Б") return "Б";
        if (raw === "ОГ") return "ОГ";
        if (raw === "ОТ") return "ОТ";
        if (raw === "УВ") return "УВ";
        if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE" || raw === "ON" || raw === "YES") return "Я";
        if (raw.includes("СМЕН") || raw.includes("SHIFT")) return "Я";
        return "";
    };
    const parseDashboardHoursValue = (rawValue: string): number => {
        const raw = String(rawValue || "").trim();
        if (!raw) return 0;
        const timeMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const h = Number(timeMatch[1]);
            const m = Number(timeMatch[2]);
            if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
        }
        const normalized = raw.replace(/\s+/g, "").replace(",", ".").replace(/[^\d.]/g, "");
        if (!normalized) return 0;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const timesheetDashboardMonthKey = useMemo(() => {
        return `${timesheetDashboardPeriod.year}-${String(timesheetDashboardPeriod.month).padStart(2, "0")}`;
    }, [timesheetDashboardPeriod.month, timesheetDashboardPeriod.year]);
    const timesheetDashboardDateRange = useMemo(() => {
        const { year, month } = timesheetDashboardPeriod;
        const lastDay = new Date(year, month, 0).getDate();
        return {
            dateFrom: `${year}-${String(month).padStart(2, "0")}-01`,
            dateTo: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
        };
    }, [timesheetDashboardPeriod.month, timesheetDashboardPeriod.year]);
    const timesheetDashboardYearOptions = useMemo(() => {
        const nowYear = new Date().getFullYear();
        const years = new Set<number>([nowYear - 2, nowYear - 1, nowYear, nowYear + 1, timesheetDashboardPeriod.year]);
        return Array.from(years).sort((a, b) => b - a);
    }, [timesheetDashboardPeriod.year]);

    const handleSlaTableSort = (column: string) => {
        if (slaTableSortColumn === column) {
            setSlaTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setSlaTableSortColumn(column);
            setSlaTableSortOrder('asc');
        }
    };

    const sortOutOfSlaRows = <T extends { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> }>(rows: T[]): T[] => {
        if (!slaTableSortColumn) return rows;
        const order = slaTableSortOrder === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            let va: string | number;
            let vb: string | number;
            switch (slaTableSortColumn) {
                case 'number': va = (a.item.Number ?? ''); vb = (b.item.Number ?? ''); break;
                case 'date': va = new Date(a.item.DatePrih || 0).getTime(); vb = new Date(b.item.DatePrih || 0).getTime(); break;
                case 'status': va = normalizeStatus(a.item.State) || ''; vb = normalizeStatus(b.item.State) || ''; break;
                case 'customer': va = stripOoo((a.item.Customer ?? (a.item as any).customer) ?? ''); vb = stripOoo((b.item.Customer ?? (b.item as any).customer) ?? ''); break;
                case 'mest': va = Number(a.item.Mest) || 0; vb = Number(b.item.Mest) || 0; break;
                case 'pw': va = Number(a.item.PW) || 0; vb = Number(b.item.PW) || 0; break;
                case 'sum': va = Number(a.item.Sum) || 0; vb = Number(b.item.Sum) || 0; break;
                case 'days': va = a.sla.actualDays; vb = b.sla.actualDays; break;
                case 'plan': va = a.sla.planDays; vb = b.sla.planDays; break;
                case 'delay': va = a.sla.delayDays; vb = b.sla.delayDays; break;
                default: return 0;
            }
            const cmp = typeof va === 'string' && typeof vb === 'string'
                ? va.localeCompare(vb)
                : (va < vb ? -1 : va > vb ? 1 : 0);
            return cmp * order;
        });
    };

    // При отключении раздела сумм (роль отправитель/получатель) переключаем тип графика с денег на вес
    useEffect(() => {
        if (!showSums && chartType === 'money') setChartType('paidWeight');
    }, [showSums]);
    useEffect(() => {
        if (!showSums) {
            setStripShowAsPercent(true);
            setDeliveryStripShowAsPercent(true);
        }
    }, [showSums]);

    // При выключении служебного режима сбрасываем вкладку «Заказчик»
    useEffect(() => {
        if (!useServiceRequest && stripTab === 'customer') setStripTab('type');
    }, [useServiceRequest, stripTab]);

    // Загрузка статусов перевозки при раскрытии строки в таблице «Перевозки вне SLA»
    useEffect(() => {
        if (!expandedSlaCargoNumber || !expandedSlaItem || !auth?.login || !auth?.password) {
            setSlaTimelineSteps(null);
            setSlaTimelineError(null);
            return;
        }
        let cancelled = false;
        setSlaTimelineLoading(true);
        setSlaTimelineError(null);
        fetchPerevozkaTimeline(auth, expandedSlaCargoNumber, expandedSlaItem, { forceServiceAuth: true })
            .then((steps) => { if (!cancelled) setSlaTimelineSteps(steps); })
            .catch((e: any) => { if (!cancelled) setSlaTimelineError(normalizeTimelineErrorMessage(e?.message)); })
            .finally(() => { if (!cancelled) setSlaTimelineLoading(false); });
        return () => { cancelled = true; };
    }, [expandedSlaCargoNumber, expandedSlaItem, auth?.login, auth?.password]);

    const testMaxMessage = async () => {
        const webApp = getWebApp();
        const logs: string[] = [];
        
        logs.push(`Time: ${new Date().toISOString()}`);
        logs.push(`Environment: ${isMaxWebApp() ? "MAX" : "Not MAX"}`);
        logs.push(`window.WebApp: ${!!(window as any).WebApp}`);
        logs.push(`window.Telegram.WebApp: ${!!window.Telegram?.WebApp}`);
        
        if (webApp) {
            logs.push(`initData: ${webApp.initData ? "present" : "absent"}`);
            logs.push(`initDataUnsafe keys: ${Object.keys(webApp.initDataUnsafe || {}).join(", ")}`);
            if (webApp.initDataUnsafe?.user) {
                logs.push(`user: ${JSON.stringify(webApp.initDataUnsafe.user)}`);
            }
            if (webApp.initDataUnsafe?.chat) {
                logs.push(`chat: ${JSON.stringify(webApp.initDataUnsafe.chat)}`);
            }
            
            const chatId = webApp.initDataUnsafe?.user?.id || webApp.initDataUnsafe?.chat?.id;
            logs.push(`Detected chatId: ${chatId}`);
            
            if (chatId) {
                try {
                    logs.push("Sending test message...");
                    const res = await fetch('/api/max-send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            chatId, 
                            text: `🛠 ТЕСТ ИЗ ДАШБОРДА\nChatID: ${chatId}\nTime: ${new Date().toLocaleTimeString()}` 
                        })
                    });
                    const resData = await res.json().catch(() => ({}));
                    logs.push(`Response status: ${res.status}`);
                    logs.push(`Response data: ${JSON.stringify(resData)}`);
                } catch (e: any) {
                    logs.push(`Error: ${e.message}`);
                }
            } else {
                logs.push("Error: No chatId found!");
            }
        } else {
            logs.push("Error: WebApp is not available!");
        }
        
        setDebugInfo(logs.join("\n"));
        console.log("[testMaxMessage]", logs);
    };

    // Один useMemo для дат (как в CargoPage), чтобы при минификации не было TDZ
    const { apiDateRange, prevRange } = useMemo(() => {
        const api =
            dateFilter === "период"
                ? { dateFrom: customDateFrom, dateTo: customDateTo }
                : dateFilter === "месяц" && selectedMonthForFilter
                    ? (() => {
                        const { year, month } = selectedMonthForFilter;
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const lastDay = new Date(year, month, 0).getDate();
                        return { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                    })()
                    : dateFilter === "год" && selectedYearForFilter
                        ? { dateFrom: `${selectedYearForFilter}-01-01`, dateTo: `${selectedYearForFilter}-12-31` }
                        : dateFilter === "неделя" && selectedWeekForFilter
                            ? getWeekRange(selectedWeekForFilter)
                            : getDateRange(dateFilter);
        const prev = getPreviousPeriodRange(dateFilter, api.dateFrom, api.dateTo);
        return { apiDateRange: api, prevRange: prev };
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);

    useEffect(() => {
        const d = dateUtils.parseDateOnly(apiDateRange.dateFrom);
        if (d) setHeatmapMonth({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }, [apiDateRange.dateFrom]);

    const { items, error, loading, mutate: mutatePerevozki } = usePerevozki({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        useServiceRequest,
        inn: !useServiceRequest ? auth.inn : undefined,
    });
    const { items: prevPeriodItems, loading: prevPeriodLoading } = usePrevPeriodPerevozki({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        dateFromPrev: prevRange?.dateFrom ?? '',
        dateToPrev: prevRange?.dateTo ?? '',
        useServiceRequest: true,
        enabled: !!useServiceRequest && !!prevRange,
    });
    const { items: invoiceItems } = useInvoices({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        activeInn: !useServiceRequest ? auth?.inn : undefined,
        useServiceRequest,
    });

    const calendarYear = new Date().getFullYear();
    const calendarDateFrom = `${calendarYear - 1}-01-01`;
    const calendarDateTo = `${calendarYear + 1}-12-31`;
    const { items: calendarInvoiceItems, mutate: mutateCalendarInvoices } = useInvoices({
        auth: showPaymentCalendar ? auth : null,
        dateFrom: calendarDateFrom,
        dateTo: calendarDateTo,
        activeInn: !useServiceRequest ? auth?.inn : undefined,
        useServiceRequest,
    });

    useEffect(() => {
        if (!useServiceRequest) return;
        const handler = () => void mutatePerevozki(undefined, { revalidate: true });
        window.addEventListener('haulz-service-refresh', handler);
        return () => window.removeEventListener('haulz-service-refresh', handler);
    }, [useServiceRequest, mutatePerevozki]);

    useEffect(() => {
        if (!showPaymentCalendar || !auth?.login || !auth?.password) return;
        let cancelled = false;
        setPaymentCalendarLoading(true);
        fetch('/api/my-payment-calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: auth.login, password: auth.password }),
        })
            .then((r) => r.json())
            .then((data: { items?: { inn: string; days_to_pay: number; payment_weekdays?: number[] }[]; work_schedules?: { inn: string; days_of_week: number[]; work_start: string; work_end: string }[] }) => {
                if (cancelled) return;
                const map: Record<string, { days_to_pay: number; payment_weekdays: number[] }> = {};
                (data?.items ?? []).forEach((row) => {
                    if (row?.inn == null) return;
                    const inn = String(row.inn).trim();
                    const days = Math.max(0, Number(row.days_to_pay) || 0);
                    const weekdays = Array.isArray(row.payment_weekdays) ? row.payment_weekdays.filter((d) => d >= 1 && d <= 5) : [];
                    map[inn] = { days_to_pay: days, payment_weekdays: weekdays };
                });
                setPaymentCalendarByInn(map);
                const ws: Record<string, WorkSchedule> = {};
                (data?.work_schedules ?? []).forEach((r) => {
                    if (r?.inn) ws[r.inn.trim()] = { days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5], work_start: r.work_start || '09:00', work_end: r.work_end || '18:00' };
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => { if (!cancelled) setPaymentCalendarByInn({}); })
            .finally(() => { if (!cancelled) setPaymentCalendarLoading(false); });
        return () => { cancelled = true; };
    }, [showPaymentCalendar, auth?.login, auth?.password]);

    useEffect(() => {
        if (!canViewTimesheetCostDashboard || !auth?.login || !auth?.password) {
            setTimesheetAnalyticsData(null);
            setTimesheetAnalyticsError(null);
            return;
        }
        let cancelled = false;
        setTimesheetAnalyticsLoading(true);
        setTimesheetAnalyticsError(null);
        fetch('/api/my-department-timesheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login: auth.login,
                password: auth.password,
                month: timesheetDashboardMonthKey,
            }),
        })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .then(({ ok, data }) => {
                if (cancelled) return;
                if (!ok) throw new Error(data?.error || 'Ошибка загрузки данных табеля');
                const employees = Array.isArray(data?.employees) ? data.employees : [];
                const entriesRaw = data?.entries && typeof data.entries === "object" ? (data.entries as Record<string, string>) : {};
                const payoutsByEmployeeRaw = data?.payoutsByEmployee && typeof data.payoutsByEmployee === "object"
                    ? (data.payoutsByEmployee as Record<string, number>)
                    : {};
                const shiftRateOverridesRaw = data?.shiftRateOverrides && typeof data.shiftRateOverrides === "object"
                    ? (data.shiftRateOverrides as Record<string, number>)
                    : {};
                const employeeRows = employees.map((row: any) => ({
                    employeeId: Number(row?.id || 0),
                    fullName: String(row?.fullName || ""),
                    department: String(row?.department || ""),
                    position: String(row?.position || ""),
                    accrualType: normalizeDashboardAccrualType(row?.accrualType),
                    accrualRate: Number(row?.accrualRate || 0),
                    active: row?.active !== false,
                })).filter((x: any) =>
                    Number.isFinite(x.employeeId)
                    && x.employeeId > 0
                );
                const entriesByEmployee = new Map<number, Array<{ date: string; value: string }>>();
                for (const [entryKey, entryValue] of Object.entries(entriesRaw)) {
                    const match = /^(\d+)__(\d{4}-\d{2}-\d{2})$/.exec(entryKey);
                    if (!match) continue;
                    const employeeId = Number(match[1]);
                    const dateIso = match[2];
                    if (!Number.isFinite(employeeId) || employeeId <= 0) continue;
                    const list = entriesByEmployee.get(employeeId) || [];
                    list.push({ date: dateIso, value: String(entryValue || "") });
                    entriesByEmployee.set(employeeId, list);
                }
                let totalHours = 0;
                let totalShifts = 0;
                let totalCost = 0;
                let totalPaid = 0;
                const employeeStats = employeeRows.map((employee: any) => {
                    const values = entriesByEmployee.get(employee.employeeId) || [];
                    const hasShiftMarks = values.some((v) => normalizeDashboardShiftMark(v.value) !== "");
                    const hasNumericHours = values.some((v) => parseDashboardHoursValue(v.value) > 0);
                    const resolvedAccrualType: "hour" | "shift" | "month" =
                        employee.accrualType === "month"
                            ? "month"
                            : (employee.accrualType === "shift" || (hasShiftMarks && !hasNumericHours) ? "shift" : "hour");
                    let employeeShifts = 0;
                    let employeeHours = 0;
                    let employeeCost = 0;
                    if (resolvedAccrualType === "shift" || resolvedAccrualType === "month") {
                        employeeShifts = values.reduce((acc, v) => acc + (normalizeDashboardShiftMark(v.value) === "Я" ? 1 : 0), 0);
                        employeeHours = employeeShifts * 8;
                        employeeCost = values.reduce((acc, v) => {
                            if (normalizeDashboardShiftMark(v.value) !== "Я") return acc;
                            const overrideKey = `${employee.employeeId}__${v.date}`;
                            const overrideRate = Number(shiftRateOverridesRaw[overrideKey]);
                            const baseRate = Number(employee.accrualRate || 0);
                            const dayRate = resolvedAccrualType === "month"
                                ? baseRate / 21
                                : (Number.isFinite(overrideRate) ? overrideRate : baseRate);
                            return acc + dayRate;
                        }, 0);
                    } else {
                        employeeHours = values.reduce((acc, v) => acc + parseDashboardHoursValue(v.value), 0);
                        employeeCost = employeeHours * Number(employee.accrualRate || 0);
                    }
                    const employeePaid = Number(payoutsByEmployeeRaw[String(employee.employeeId)] || 0);
                    const employeeOutstanding = Math.max(0, Number((employeeCost - employeePaid).toFixed(2)));
                    totalHours += employeeHours;
                    totalShifts += employeeShifts;
                    totalCost += employeeCost;
                    totalPaid += employeePaid;
                    return {
                        ...employee,
                        totalHours: Number(employeeHours.toFixed(2)),
                        totalShifts: Number(employeeShifts || 0),
                        totalCost: Number(employeeCost.toFixed(2)),
                        totalPaid: Number(employeePaid.toFixed(2)),
                        totalOutstanding: employeeOutstanding,
                    };
                });
                setTimesheetAnalyticsData({
                    totalHours: Number(totalHours.toFixed(2)),
                    totalShifts: Number(totalShifts || 0),
                    totalCost: Number(totalCost.toFixed(2)),
                    totalPaid: Number(totalPaid.toFixed(2)),
                    totalOutstanding: Math.max(0, Number((totalCost - totalPaid).toFixed(2))),
                    employees: employeeStats,
                });
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setTimesheetAnalyticsError((e as Error)?.message || 'Ошибка загрузки данных табеля');
                setTimesheetAnalyticsData(null);
            })
            .finally(() => {
                if (!cancelled) setTimesheetAnalyticsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [canViewTimesheetCostDashboard, auth?.login, auth?.password, timesheetDashboardMonthKey]);
    useEffect(() => {
        if (!canViewTimesheetCostDashboard || !auth?.login || !auth?.password) {
            setTimesheetPaidWeight(0);
            return;
        }
        let cancelled = false;
        fetch('/api/perevozki', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login: auth.login,
                password: auth.password,
                dateFrom: timesheetDashboardDateRange.dateFrom,
                dateTo: timesheetDashboardDateRange.dateTo,
                ...(useServiceRequest ? { serviceMode: true } : {}),
                ...(!useServiceRequest && auth?.inn ? { inn: auth.inn } : {}),
                ...(auth?.isRegisteredUser ? { isRegisteredUser: true } : {}),
            }),
        })
            .then((r) => r.json().catch(() => ([])))
            .then((data) => {
                if (cancelled) return;
                const list = Array.isArray(data) ? data : (Array.isArray((data as any)?.items) ? (data as any).items : []);
                const totalPw = list.reduce((acc: number, item: any) => {
                    if (isReceivedInfoStatus(item?.State)) return acc;
                    const pwRaw = item?.PW;
                    const pw = typeof pwRaw === 'string' ? parseFloat(pwRaw) || 0 : Number(pwRaw || 0);
                    return acc + pw;
                }, 0);
                setTimesheetPaidWeight(Number(totalPw.toFixed(2)));
            })
            .catch(() => {
                if (!cancelled) setTimesheetPaidWeight(0);
            });
        return () => {
            cancelled = true;
        };
    }, [
        canViewTimesheetCostDashboard,
        auth?.login,
        auth?.password,
        auth?.inn,
        auth?.isRegisteredUser,
        useServiceRequest,
        timesheetDashboardDateRange.dateFrom,
        timesheetDashboardDateRange.dateTo,
    ]);

    const unpaidCount = useMemo(() => {
        return items.filter(item => !isReceivedInfoStatus(item.State) && getPaymentFilterKey(item.StateBill) === "unpaid").length;
    }, [items]);

    const readyCount = useMemo(() => {
        return items.filter(item => !isReceivedInfoStatus(item.State) && getFilterKeyByStatus(item.State) === "ready").length;
    }, [items]);

    const uniqueSenders = useMemo(() => [...new Set(items.map(i => (i.Sender ?? '').trim()).filter(Boolean))].sort(), [items]);
    const uniqueReceivers = useMemo(() => [...new Set(items.map(i => (i.Receiver ?? (i as any).receiver ?? '').trim()).filter(Boolean))].sort(), [items]);
    
    // Фильтрация
    const filteredItems = useMemo(() => {
        let res = items.filter(i => !isReceivedInfoStatus(i.State));
        if (statusFilter === 'favorites') {
            // Фильтр избранных (если нужно)
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        return res;
    }, [items, statusFilter, senderFilter, receiverFilter, billStatusFilter, typeFilter, routeFilter]);
    const parseDashboardDateOnly = useCallback((value: unknown): Date | null => {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        if (/^0?1[./-]0?1[./-](1900|1901|0001)$/.test(raw)) return null;
        const parsed = dateUtils.parseDateOnly(raw) ?? new Date(raw);
        if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() <= 1901) return null;
        return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }, []);
    const getManualPlannedDate = useCallback((item: CargoItem): Date | null => {
        const candidates = [
            (item as any).DateArrival,
            (item as any).PlannedDeliveryDate,
            (item as any).PlanDeliveryDate,
            (item as any).DateDeliveryPlan,
            (item as any).ПлановаяДатаДоставки,
            (item as any).ПланДатаДоставки,
            (item as any).ПлановаяДата,
            (item as any).PlanDate,
        ];
        for (const candidate of candidates) {
            const parsed = parseDashboardDateOnly(candidate);
            if (parsed) return parsed;
        }
        return null;
    }, [parseDashboardDateOnly]);
    const getSendingStartDate = useCallback((item: CargoItem): Date | null => {
        const candidates = [
            (item as any).DateOtpr,
            (item as any).DateSend,
            (item as any).DateShipment,
            (item as any).ShipmentDate,
            (item as any).ДатаОтправки,
            (item as any).ДатаОтгрузки,
            (item as any).DateDoc,
            (item as any).DatePrih,
            (item as any).Date,
            (item as any).date,
            (item as any).Дата,
        ];
        for (const candidate of candidates) {
            const parsed = parseDashboardDateOnly(candidate);
            if (parsed) return parsed;
        }
        return null;
    }, [parseDashboardDateOnly]);
    const getActualDeliveryDate = useCallback((item: CargoItem): Date | null => {
        const candidates = [
            (item as any).DateVr,
            (item as any).DateDeliveryFact,
            (item as any).FactDeliveryDate,
            (item as any).ДатаФактическойДоставки,
            (item as any).ДатаВручения,
            (item as any).DateDelivery,
            (item as any).DeliveryDate,
        ];
        for (const candidate of candidates) {
            const parsed = parseDashboardDateOnly(candidate);
            if (parsed) return parsed;
        }
        return null;
    }, [parseDashboardDateOnly]);
    const getRouteTypePlanDays = useMemo(() => {
        const dayMs = 24 * 60 * 60 * 1000;
        const byBucket = new Map<string, Array<{ actualMs: number; days: number }>>();
        const routeKeyFor = (item: CargoItem): string => {
            const from = cityToCode(item.CitySender) || String(item.CitySender ?? '').trim().toUpperCase() || '—';
            const to = cityToCode(item.CityReceiver) || String(item.CityReceiver ?? '').trim().toUpperCase() || '—';
            return `${from}-${to}`;
        };
        const typeKeyFor = (item: CargoItem): 'ferry' | 'auto' => (isFerry(item) ? 'ferry' : 'auto');
        (items || []).forEach((item) => {
            const start = getSendingStartDate(item);
            const actual = getActualDeliveryDate(item);
            if (!start || !actual) return;
            const diffDays = Math.round((actual.getTime() - start.getTime()) / dayMs);
            if (!Number.isFinite(diffDays) || diffDays <= 0) return;
            if (diffDays > 120) return;
            const bucket = `${routeKeyFor(item)}|${typeKeyFor(item)}`;
            const list = byBucket.get(bucket) ?? [];
            list.push({ actualMs: actual.getTime(), days: diffDays });
            byBucket.set(bucket, list);
        });

        const planDaysByBucket = new Map<string, number>();
        byBucket.forEach((rows, bucket) => {
            const lastFive = [...rows]
                .sort((a, b) => b.actualMs - a.actualMs)
                .slice(0, 5)
                .map((r) => r.days);
            if (lastFive.length === 0) return;
            const values =
                lastFive.length >= 3
                    ? (() => {
                          const sorted = [...lastFive].sort((a, b) => a - b);
                          return sorted.slice(1, -1);
                      })()
                    : lastFive;
            if (values.length === 0) return;
            const avg = values.reduce((acc, n) => acc + n, 0) / values.length;
            const rounded = Math.max(1, Math.round(avg));
            planDaysByBucket.set(bucket, rounded);
        });
        return planDaysByBucket;
    }, [items, getSendingStartDate, getActualDeliveryDate]);
    const getEffectivePlannedDate = useCallback((item: CargoItem): Date | null => {
        const manual = getManualPlannedDate(item);
        if (manual) return manual;
        const start = getSendingStartDate(item);
        if (!start) return null;
        const from = cityToCode(item.CitySender) || String(item.CitySender ?? '').trim().toUpperCase() || '—';
        const to = cityToCode(item.CityReceiver) || String(item.CityReceiver ?? '').trim().toUpperCase() || '—';
        const type = isFerry(item) ? 'ferry' : 'auto';
        const days = getRouteTypePlanDays.get(`${from}-${to}|${type}`);
        if (!days) return null;
        const planned = new Date(start);
        planned.setDate(planned.getDate() + days);
        return planned;
    }, [getManualPlannedDate, getSendingStartDate, getRouteTypePlanDays]);
    const cargoFlowByPlan = useMemo(() => {
        const dateToKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const getPlannedKey = (item: CargoItem): string | null => {
            const planned = getEffectivePlannedDate(item);
            return planned ? dateToKey(planned) : null;
        };
        const getActualKey = (item: CargoItem): string | null => {
            const candidates = [
                (item as any).DateVr,
                (item as any).DateDeliveryFact,
                (item as any).FactDeliveryDate,
                (item as any).ДатаФактическойДоставки,
                (item as any).ДатаВручения,
            ];
            for (const candidate of candidates) {
                const parsed = parseDashboardDateOnly(candidate);
                const key = parsed ? dateToKey(parsed) : null;
                if (key) return key;
            }
            return null;
        };
        const toNumber = (value: unknown) => {
            const raw = String(value ?? '').trim().replace(',', '.');
            const n = Number(raw);
            return Number.isFinite(n) ? n : 0;
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayKey = dateToKey(today);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = dateToKey(tomorrow);
        const horizon = new Date(today);
        horizon.setDate(horizon.getDate() + 7);
        const horizonKey = dateToKey(horizon);

        let withPlan = 0;
        let withoutPlan = 0;
        let overdue = 0;
        let dueToday = 0;
        let dueTomorrow = 0;
        let dueNext7 = 0;
        let deliveredOnTime = 0;
        let deliveredLate = 0;
        const emptyTransportStats = () => ({ count: 0, pw: 0, mest: 0, vol: 0 });
        const byDate = new Map<string, {
            count: number;
            pw: number;
            mest: number;
            vol: number;
            ferry: { count: number; pw: number; mest: number; vol: number };
            auto: { count: number; pw: number; mest: number; vol: number };
        }>();

        filteredItems.forEach((item) => {
            const plannedKey = getPlannedKey(item);
            if (!plannedKey) {
                withoutPlan += 1;
                return;
            }
            withPlan += 1;
            const entry = byDate.get(plannedKey) ?? {
                count: 0,
                pw: 0,
                mest: 0,
                vol: 0,
                ferry: emptyTransportStats(),
                auto: emptyTransportStats(),
            };
            const mest = toNumber(item.Mest);
            const pw = toNumber(item.PW);
            const vol = toNumber((item as any).Value ?? (item as any).Volume ?? (item as any).V);
            const transportKey = isFerry(item) ? 'ferry' : 'auto';
            entry.count += 1;
            entry.pw += pw;
            entry.mest += mest;
            entry.vol += vol;
            entry[transportKey].count += 1;
            entry[transportKey].pw += pw;
            entry[transportKey].mest += mest;
            entry[transportKey].vol += vol;
            byDate.set(plannedKey, entry);

            const statusKey = getFilterKeyByStatus(item.State);
            const isDelivered = statusKey === 'delivered';
            if (!isDelivered) {
                if (plannedKey < todayKey) overdue += 1;
                else if (plannedKey === todayKey) dueToday += 1;
                else if (plannedKey === tomorrowKey) dueTomorrow += 1;
                else if (plannedKey <= horizonKey) dueNext7 += 1;
            } else {
                const actualKey = getActualKey(item);
                if (!actualKey) return;
                if (actualKey <= plannedKey) deliveredOnTime += 1;
                else deliveredLate += 1;
            }
        });

        const upcomingSeries = Array.from({ length: 7 }).map((_, idx) => {
            const date = new Date(today);
            date.setDate(date.getDate() + idx);
            const key = dateToKey(date);
            const values = byDate.get(key) ?? {
                count: 0,
                pw: 0,
                mest: 0,
                vol: 0,
                ferry: emptyTransportStats(),
                auto: emptyTransportStats(),
            };
            return {
                key,
                count: values.count,
                pw: values.pw,
                mest: values.mest,
                vol: values.vol,
                ferry: values.ferry,
                auto: values.auto,
            };
        });

        return {
            total: filteredItems.length,
            withPlan,
            withoutPlan,
            overdue,
            dueToday,
            dueTomorrow,
            dueNext7,
            deliveredOnTime,
            deliveredLate,
            upcomingSeries,
        };
    }, [filteredItems, getEffectivePlannedDate]);
    const planVsFactDashboard = useMemo(() => {
        const dayMs = 24 * 60 * 60 * 1000;
        const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const parseDate = (value: unknown): Date | null => {
            const raw = String(value ?? '').trim();
            if (!raw) return null;
            if (/^0?1[./-]0?1[./-](1900|1901|0001)$/.test(raw)) return null;
            const parsed = dateUtils.parseDateOnly(raw) ?? new Date(raw);
            if (!Number.isFinite(parsed.getTime()) || parsed.getFullYear() <= 1901) return null;
            return startOfDay(parsed);
        };
        const getPlannedDate = (item: CargoItem): Date | null => {
            const planned = getEffectivePlannedDate(item);
            return planned ? startOfDay(planned) : null;
        };
        const getActualDate = (item: CargoItem): Date | null => {
            const candidates = [
                (item as any).DateVr,
                (item as any).DateDeliveryFact,
                (item as any).FactDeliveryDate,
                (item as any).ДатаФактическойДоставки,
                (item as any).ДатаВручения,
            ];
            for (const candidate of candidates) {
                const parsed = parseDate(candidate);
                if (parsed) return parsed;
            }
            return null;
        };
        const routeLabel = (item: CargoItem) => {
            const from = cityToCode(item.CitySender) || (item.CitySender ?? '').trim();
            const to = cityToCode(item.CityReceiver) || (item.CityReceiver ?? '').trim();
            return [from, to].filter(Boolean).join(' – ') || '—';
        };

        let withPlan = 0;
        let withoutPlan = 0;
        let pendingFact = 0;
        let onTime = 0;
        let late = 0;
        let overdueOpen = 0;
        let deviationSum = 0;
        let deviationCount = 0;
        let lateDelaySum = 0;
        const today = startOfDay(new Date());

        const byPlanDate = new Map<string, { onTime: number; late: number; total: number }>();
        const lateRows: { number: string; route: string; planned: string; actual: string; delayDays: number }[] = [];

        filteredItems.forEach((item) => {
            const planned = getPlannedDate(item);
            if (!planned) {
                withoutPlan += 1;
                return;
            }
            withPlan += 1;
            const actual = getActualDate(item);
            const planKey = toKey(planned);
            const dateBucket = byPlanDate.get(planKey) ?? { onTime: 0, late: 0, total: 0 };
            dateBucket.total += 1;
            if (!actual) {
                pendingFact += 1;
                if (planned.getTime() < today.getTime()) overdueOpen += 1;
                byPlanDate.set(planKey, dateBucket);
                return;
            }

            const diffDays = Math.round((actual.getTime() - planned.getTime()) / dayMs);
            deviationSum += diffDays;
            deviationCount += 1;
            if (diffDays <= 0) {
                onTime += 1;
                dateBucket.onTime += 1;
            } else {
                late += 1;
                lateDelaySum += diffDays;
                dateBucket.late += 1;
                lateRows.push({
                    number: String(item.Number ?? '').trim() || '—',
                    route: routeLabel(item),
                    planned: planKey,
                    actual: toKey(actual),
                    delayDays: diffDays,
                });
            }
            byPlanDate.set(planKey, dateBucket);
        });

        const trend = Array.from(byPlanDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-10)
            .map(([key, row]) => ({ key, ...row }));

        const maxTotal = Math.max(1, ...trend.map((row) => row.total));
        const topLate = lateRows.sort((a, b) => b.delayDays - a.delayDays).slice(0, 5);

        return {
            total: filteredItems.length,
            withPlan,
            withoutPlan,
            pendingFact,
            overdueOpen,
            onTime,
            late,
            onTimeRate: withPlan > 0 ? Math.round((onTime / withPlan) * 100) : 0,
            avgDeviationDays: deviationCount > 0 ? Math.round((deviationSum / deviationCount) * 10) / 10 : 0,
            avgLateDays: late > 0 ? Math.round((lateDelaySum / late) * 10) / 10 : 0,
            trend,
            maxTotal,
            topLate,
        };
    }, [filteredItems, getEffectivePlannedDate]);

    useEffect(() => {
        if (!useServiceRequest || !auth?.login || !auth?.password || filteredItems.length === 0) return;
        const inns = [...new Set(filteredItems.map((i) => getInnFromCargo(i)).filter((x): x is string => !!x))];
        if (inns.length === 0) return;
        let cancelled = false;
        fetch('/api/customer-work-schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: auth.login, password: auth.password, inns }),
        })
            .then((r) => r.json())
            .then((data: { items?: { inn: string; days_of_week: number[]; work_start: string; work_end: string }[] }) => {
                if (cancelled) return;
                const ws: Record<string, WorkSchedule> = {};
                (data?.items ?? []).forEach((r) => {
                    if (r?.inn) ws[r.inn.trim()] = { days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5], work_start: r.work_start || '09:00', work_end: r.work_end || '18:00' };
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => { /* ignore */ });
        return () => { cancelled = true; };
    }, [useServiceRequest, auth?.login, auth?.password, filteredItems]);

    /** Фильтрация данных предыдущего периода (те же фильтры, что и для текущего) */
    const filteredPrevPeriodItems = useMemo(() => {
        if (!useServiceRequest || prevPeriodItems.length === 0) return [];
        let res = prevPeriodItems.filter(i => !isReceivedInfoStatus(i.State));
        if (statusFilter === 'favorites') {
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        return res;
    }, [prevPeriodItems, useServiceRequest, statusFilter, senderFilter, receiverFilter, billStatusFilter, typeFilter, routeFilter]);

    /** Плановое поступление по счетам: срок в календарных днях; при наступлении срока — первый платёжный день недели (если заданы) или первый рабочий день. */
    const plannedByDate = useMemo(() => {
        const map = new Map<string, { total: number; items: { customer: string; sum: number; number?: string }[] }>();
        const invDate = (inv: any): string => {
            const raw = String(inv?.DateDoc ?? inv?.Date ?? inv?.date ?? inv?.dateDoc ?? inv?.Дата ?? '').trim();
            if (!raw) return '';
            const parsed = dateUtils.parseDateOnly(raw);
            if (!parsed) return '';
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };
        const invSum = (inv: any) => {
            const v = inv?.SumDoc ?? inv?.Sum ?? inv?.sum ?? inv?.Сумма ?? inv?.Amount ?? 0;
            return typeof v === 'string' ? parseFloat(v) || 0 : Number(v) || 0;
        };
        const invInn = (inv: any) =>
            String(
                inv?.INN ??
                inv?.Inn ??
                inv?.inn ??
                inv?.CustomerINN ??
                inv?.CustomerInn ??
                inv?.INNCustomer ??
                inv?.InnCustomer ??
                inv?.КонтрагентИНН ??
                ''
            )
                .replace(/\D/g, '')
                .trim();
        const invCustomer = (inv: any) => String(inv?.Customer ?? inv?.customer ?? inv?.Контрагент ?? inv?.Contractor ?? inv?.Organization ?? '').trim() || '—';
        const invNumber = (inv: any) => (inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? '').toString();
        const invStatus = (inv: any) => normalizeInvoiceStatus(inv?.Status ?? inv?.State ?? inv?.state ?? inv?.Статус ?? inv?.status ?? inv?.PaymentStatus ?? '');
        (calendarInvoiceItems ?? []).forEach((inv: any) => {
            const dateStr = invDate(inv);
            if (!dateStr) return;
            // Календарь строим по счетам, выставленным в выбранном периоде (Date filter).
            if (dateStr < apiDateRange.dateFrom || dateStr > apiDateRange.dateTo) return;
            // Учитываем только не оплаченные/частично оплаченные счета.
            const status = invStatus(inv);
            if (status === 'Оплачен') return;
            const sum = invSum(inv);
            if (sum <= 0) return;
            const inn = invInn(inv) || String(auth?.inn ?? '').replace(/\D/g, '').trim();
            const cal = paymentCalendarByInn[inn] ?? { days_to_pay: 0, payment_weekdays: [] };
            const days = cal.days_to_pay ?? 0;
            const weekdays = cal.payment_weekdays ?? [];
            const parsedDate = dateUtils.parseDateOnly(dateStr);
            if (!parsedDate) return;
            const d = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
            d.setDate(d.getDate() + days);
            const deadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const key = weekdays.length > 0 ? getFirstPaymentWeekdayOnOrAfter(deadline, weekdays) : getFirstWorkingDayOnOrAfter(deadline);
            const customer = invCustomer(inv);
            const entry = map.get(key);
            if (!entry) {
                map.set(key, { total: sum, items: [{ customer, sum, number: invNumber(inv) }] });
            } else {
                entry.total += sum;
                entry.items.push({ customer, sum, number: invNumber(inv) });
            }
        });
        return map;
    }, [calendarInvoiceItems, paymentCalendarByInn, apiDateRange.dateFrom, apiDateRange.dateTo, auth?.inn]);
    
    // Подготовка данных для графиков (группировка по датам)
    const chartData = useMemo(() => {
        const dataMap = new Map<string, { date: string; sum: number; pw: number; w: number; mest: number; vol: number }>();
        
        filteredItems.forEach(item => {
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
    }, [filteredItems]);

    const DIAGRAM_COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#3b82f6', '#ef4444', '#84cc16'];
    const stripTotals = useMemo(() => {
        let sum = 0, pw = 0, w = 0, vol = 0, mest = 0;
        filteredItems.forEach(item => {
            sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
            mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        });
        return { sum, pw, w, vol, mest };
    }, [filteredItems]);
    const companyTimesheetSummary = useMemo(() => ({
        totalHours: Number(timesheetAnalyticsData?.totalHours || 0),
        totalShifts: Number(timesheetAnalyticsData?.totalShifts || 0),
        totalMoney: Number(timesheetAnalyticsData?.totalCost || 0),
        totalPaid: Number(timesheetAnalyticsData?.totalPaid || 0),
        totalOutstanding: Number(timesheetAnalyticsData?.totalOutstanding || 0),
    }), [timesheetAnalyticsData?.totalHours, timesheetAnalyticsData?.totalShifts, timesheetAnalyticsData?.totalCost, timesheetAnalyticsData?.totalPaid, timesheetAnalyticsData?.totalOutstanding]);
    const timesheetCostPerKg = useMemo(() => {
        const totalCost = companyTimesheetSummary.totalMoney;
        if (!(timesheetPaidWeight > 0)) return 0;
        return totalCost / timesheetPaidWeight;
    }, [companyTimesheetSummary.totalMoney, timesheetPaidWeight]);
    const topEmployeesByTimesheetCost = useMemo(() => {
        const list = timesheetAnalyticsData?.employees || [];
        return [...list]
            .sort((a, b) => Number(b.totalCost || 0) - Number(a.totalCost || 0))
            .slice(0, 5);
    }, [timesheetAnalyticsData?.employees]);
    const timesheetByDepartment = useMemo(() => {
        const rows = timesheetAnalyticsData?.employees || [];
        const grouped = new Map<string, { department: string; totalCost: number; totalPaid: number; totalOutstanding: number; totalHours: number; totalShifts: number; employeeCount: number }>();
        for (const row of rows) {
            const department = String(row.department || '').trim() || 'Без подразделения';
            const current = grouped.get(department) || { department, totalCost: 0, totalPaid: 0, totalOutstanding: 0, totalHours: 0, totalShifts: 0, employeeCount: 0 };
            current.totalCost += Number(row.totalCost || 0);
            current.totalPaid += Number(row.totalPaid || 0);
            current.totalOutstanding += Number(row.totalOutstanding || 0);
            current.totalHours += Number(row.totalHours || 0);
            current.totalShifts += Number(row.totalShifts || 0);
            current.employeeCount += 1;
            grouped.set(department, current);
        }
        const totalCost = companyTimesheetSummary.totalMoney;
        return Array.from(grouped.values())
            .map((row) => ({
                ...row,
                share: totalCost > 0 ? (row.totalCost / totalCost) * 100 : 0,
                costPerKg: timesheetPaidWeight > 0 ? row.totalCost / timesheetPaidWeight : 0,
            }))
            .sort((a, b) => b.totalCost - a.totalCost);
    }, [timesheetAnalyticsData?.employees, companyTimesheetSummary.totalMoney, timesheetPaidWeight]);
    const getValForChart = useCallback((item: CargoItem) => {
        if (chartType === 'money') return typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        if (chartType === 'paidWeight') return typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        if (chartType === 'weight') return typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
        if (chartType === 'pieces') return typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        return typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
    }, [chartType]);

    /** Монитор доставки: только статус «доставлено» с DateVr в выбранном периоде (без фильтра по заказчику) */
    const deliveryFilteredItems = useMemo(() => {
        let res = items.filter(i => !isReceivedInfoStatus(i.State));
        if (statusFilter === 'favorites') {
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        }
        res = res.filter(i => getFilterKeyByStatus(i.State) === 'delivered' && isDateInRange(i.DateVr, apiDateRange.dateFrom, apiDateRange.dateTo));
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        return res;
    }, [items, statusFilter, senderFilter, receiverFilter, billStatusFilter, typeFilter, routeFilter, apiDateRange]);
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
        filteredItems.forEach(item => {
            const v = getValForChart(item);
            if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryVal += v;
            else autoVal += v;
        });
        let autoPrev = 0, ferryPrev = 0;
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const v = getValForChart(item);
                if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryPrev += v;
                else autoPrev += v;
            });
        }
        const total = autoVal + ferryVal || 1;
        const dynamics = (cur: number, prev: number): number | null => {
            if (!hasPrev) return null;
            if (prev === 0) return cur > 0 ? 100 : null;
            return Math.round(((cur - prev) / prev) * 100);
        };
        return [
            { label: 'Авто', value: autoVal, percent: Math.round((autoVal / total) * 100), color: DIAGRAM_COLORS[0], dynamics: dynamics(autoVal, autoPrev) },
            { label: 'Паром', value: ferryVal, percent: Math.round((ferryVal / total) * 100), color: DIAGRAM_COLORS[1], dynamics: dynamics(ferryVal, ferryPrev) },
        ];
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const slaStats = useMemo(() => {
        const withSla = filteredItems.map(i => getSlaInfo(i, workScheduleByInn)).filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
        const total = withSla.length;
        const onTime = withSla.filter(s => s.onTime).length;
        const delayed = withSla.filter(s => !s.onTime);
        const avgDelay = delayed.length > 0
            ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length)
            : 0;
        // Мин/макс/среднее только по неотрицательным срокам доставки (ошибки дат дают отрицательные значения)
        const actualDaysValid = withSla.map(s => s.actualDays).filter(d => d >= 0);
        const minDays = actualDaysValid.length ? Math.min(...actualDaysValid) : 0;
        const maxDays = actualDaysValid.length ? Math.max(...actualDaysValid) : 0;
        const avgDays = actualDaysValid.length ? Math.round(actualDaysValid.reduce((a, b) => a + b, 0) / actualDaysValid.length) : 0;
        return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay, minDays, maxDays, avgDays };
    }, [filteredItems, workScheduleByInn]);

    const slaStatsByType = useMemo(() => {
        const autoItems = filteredItems.filter(i => !isFerry(i));
        const ferryItems = filteredItems.filter(i => isFerry(i));
        const calc = (arr: CargoItem[]) => {
            const withSla = arr.map(i => getSlaInfo(i, workScheduleByInn)).filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
            const total = withSla.length;
            const onTime = withSla.filter(s => s.onTime).length;
            const delayed = withSla.filter(s => !s.onTime);
            const avgDelay = delayed.length > 0 ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length) : 0;
            return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay };
        };
        return { auto: calc(autoItems), ferry: calc(ferryItems) };
    }, [filteredItems, workScheduleByInn]);

    /** Перевозки вне SLA по типу (для таблицы в подробностях, только в служебном режиме) */
    const outOfSlaByType = useMemo(() => {
        const withSla = filteredItems
            .map(i => ({ item: i, sla: getSlaInfo(i, workScheduleByInn) }))
            .filter((x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } => x.sla != null && !x.sla.onTime);
        return {
            auto: withSla.filter(x => !isFerry(x.item)),
            ferry: withSla.filter(x => isFerry(x.item)),
        };
    }, [filteredItems, workScheduleByInn]);

    const sortedOutOfSlaAuto = useMemo(() => sortOutOfSlaRows(outOfSlaByType.auto), [outOfSlaByType.auto, slaTableSortColumn, slaTableSortOrder]);
    const sortedOutOfSlaFerry = useMemo(() => sortOutOfSlaRows(outOfSlaByType.ferry), [outOfSlaByType.ferry, slaTableSortColumn, slaTableSortOrder]);

    const slaTrend = useMemo(() => {
        const withSla = filteredItems
            .map(i => ({ item: i, sla: getSlaInfo(i, workScheduleByInn) }))
            .filter((x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } => x.sla != null);
        if (withSla.length < 4) return null;
        const sorted = [...withSla].sort((a, b) => (new Date(a.item.DateVr || 0).getTime()) - (new Date(b.item.DateVr || 0).getTime()));
        const mid = Math.floor(sorted.length / 2);
        const first = sorted.slice(0, mid);
        const second = sorted.slice(mid);
        const p1 = first.length ? Math.round((first.filter(x => x.sla.onTime).length / first.length) * 100) : 0;
        const p2 = second.length ? Math.round((second.filter(x => x.sla.onTime).length / second.length) * 100) : 0;
        if (p2 > p1) return 'up';
        if (p2 < p1) return 'down';
        return null;
    }, [filteredItems, workScheduleByInn]);

    const stripDiagramBySender = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Sender ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Sender ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const stripDiagramByReceiver = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const stripDiagramByCustomer = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);

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

        filteredItems.forEach((item) => {
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
    }, [showSums, stripTab, filteredItems, stripDiagramBySender, stripDiagramByReceiver, stripDiagramByCustomer]);

    type DashboardChartPoint = { date: string; value: number; dateKey?: string };
    type MainChartVariant = 'columns' | 'line' | 'area' | 'combo' | 'dot';
    type DashboardChartVariant =
        | 'columns'
        | 'groupedColumns'
        | 'stackedColumns'
        | 'stacked100'
        | 'line'
        | 'multiLine'
        | 'area'
        | 'stackedArea'
        | 'combo'
        | 'step'
        | 'lollipop'
        | 'dot'
        | 'heatmap'
        | 'weekCards'
        | 'bulletBars'
        | 'sparklineKpi';

    // Функция для создания SVG графика
    const renderChart = (
        data: DashboardChartPoint[],
        title: string,
        color: string,
        formatValue: (val: number) => string,
        variant: MainChartVariant,
        outerWidthPx: number,
    ) => {
        if (data.length === 0) {
            return (
                <Panel className="cargo-card" style={{ marginBottom: '1rem' }}>
                    <Typography.Headline style={{ marginBottom: '1rem', fontSize: '1rem' }}>{title}</Typography.Headline>
                    <Typography.Body className="text-theme-secondary">Нет данных для отображения</Typography.Body>
                    <Flex style={{ gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                        <Button className="filter-button" type="button" onClick={() => setDateFilter("месяц")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            За месяц
                        </Button>
                        <Button className="filter-button" type="button" onClick={() => setDateFilter("все")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            За всё время
                        </Button>
                        <Button className="filter-button" type="button" onClick={() => setStatusFilter("all")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            Сбросить фильтр статуса
                        </Button>
                    </Flex>
                </Panel>
            );
        }
        
        // Округляем значения до целых и нормализуем дату, чтобы график не падал на пустых значениях
        const roundedData = data.map((d) => {
            const numericValue = Number(d?.value);
            const normalizedValue = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
            const rawDate = String(d?.date ?? d?.dateKey ?? "").trim();
            return {
                ...d,
                value: normalizedValue,
                date: rawDate || "—",
            };
        });
        const maxValue = Math.max(...roundedData.map(d => d.value), 1);
        const scaleMax = maxValue * 1.1; // Максимум шкалы = max + 10%
        
        const chartHeight = 125;
        const paddingLeft = 60;
        const paddingRight = 30;
        const paddingTop = 16;
        const paddingBottom = 45;
        const chartWidth = Math.max(280, Math.floor(outerWidthPx));
        const innerPlotW = Math.max(80, chartWidth - paddingLeft - paddingRight);
        const n = roundedData.length;
        const barSpacing = 6;
        const barWidth = n > 0
            ? Math.max(4, (innerPlotW - Math.max(0, n - 1) * barSpacing) / n)
            : 12;
        const availableHeight = chartHeight - paddingTop - paddingBottom;
        const points = roundedData.map((d, idx) => {
            const barHeight = (d.value / scaleMax) * availableHeight;
            const x = paddingLeft + idx * (barWidth + barSpacing);
            const y = chartHeight - paddingBottom - barHeight;
            return { x, y, barHeight, value: d.value };
        });
        const linePoints = points.map((p) => `${p.x + barWidth / 2},${p.y}`).join(' ');
        const areaPath = points.length > 1
            ? `M ${points[0].x + barWidth / 2} ${chartHeight - paddingBottom} L ${points.map((p) => `${p.x + barWidth / 2} ${p.y}`).join(' L ')} L ${points[points.length - 1].x + barWidth / 2} ${chartHeight - paddingBottom} Z`
            : '';
        
        // Градиенты для столбцов (полутона, сложные)
        const gradientId = `gradient-${color.replace('#', '')}`;
        // Создаем более светлый и темный оттенки для градиента
        const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };
        const rgb = hexToRgb(color);
        const lightColor = rgb ? `rgb(${Math.min(255, rgb.r + 40)}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 40)})` : color;
        const darkColor = rgb ? `rgb(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)})` : color;
        
        return (
            <div>
                <div style={{ overflowX: 'auto', width: '100%', minWidth: 0 }}>
                    <svg
                        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                        width="100%"
                        height={chartHeight}
                        preserveAspectRatio="xMinYMid meet"
                        style={{ display: 'block', maxWidth: '100%' }}
                    >
                        {/* Определение градиента */}
                        <defs>
                            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={lightColor} stopOpacity="0.9" />
                                <stop offset="100%" stopColor={darkColor} stopOpacity="0.6" />
                            </linearGradient>
                        </defs>
                        
                        {/* Горизонтальная ось */}
                        <line 
                            x1={paddingLeft} 
                            y1={chartHeight - paddingBottom} 
                            x2={chartWidth - paddingRight} 
                            y2={chartHeight - paddingBottom} 
                            stroke="var(--color-border)" 
                            strokeWidth="1.5" 
                            opacity="0.5"
                        />
                        
                        {/* Вертикальная ось */}
                        <line 
                            x1={paddingLeft} 
                            y1={paddingTop} 
                            x2={paddingLeft} 
                            y2={chartHeight - paddingBottom} 
                            stroke="var(--color-border)" 
                            strokeWidth="1.5" 
                            opacity="0.5"
                        />
                        
                        {/* Основной график по выбранному стилю */}
                        {(variant === 'columns' || variant === 'combo') && points.map((p, idx) => (
                                    <rect
                                key={`bar-${idx}`}
                                x={p.x}
                                y={p.y}
                                        width={barWidth}
                                height={p.barHeight}
                                        fill={`url(#${gradientId})`}
                                opacity={variant === 'combo' ? 0.38 : 1}
                                        rx="4"
                                        style={{ transition: 'all 0.3s ease' }}
                                    />
                        ))}
                        {variant === 'area' && areaPath && (
                            <>
                                <path d={areaPath} fill={lightColor} opacity="0.22" />
                                <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </>
                        )}
                        {(variant === 'line' || variant === 'combo') && (
                            <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        {variant === 'dot' && points.map((p, idx) => (
                            <circle key={`dot-main-${idx}`} cx={p.x + barWidth / 2} cy={p.y} r="4" fill={color} opacity="0.9" />
                        ))}

                        {/* Подписи значений — только для столбцов */}
                        {roundedData.map((d, idx) => {
                            const { x, y, barHeight } = points[idx];
                            
                            return (
                                <g key={idx}>
                                    {/* Значение вертикально внутри столбца */}
                                    {variant === 'columns' && barHeight > 20 && (
                                        <text
                                            x={x + barWidth / 2}
                                            y={y + barHeight / 2}
                                            fontSize="7"
                                            fill="var(--color-text-primary)"
                                            textAnchor="middle"
                                            fontWeight="600"
                                            dominantBaseline="middle"
                                            transform={`rotate(-90 ${x + barWidth / 2} ${y + barHeight / 2})`}
                                        >
                                            {formatValue(d.value)}
                                        </text>
                                    )}
                                    
                                    {/* Дата вертикально под столбцом: день 1 раз, выходные/праздники — красным */}
                                    <text
                                        x={x + barWidth / 2}
                                        y={chartHeight - paddingBottom + 20}
                                        fontSize="10"
                                        fill={getDateTextColor((d as { dateKey?: string }).dateKey || d.date)}
                                        textAnchor="middle"
                                        transform={`rotate(-45 ${x + barWidth / 2} ${chartHeight - paddingBottom + 20})`}
                                    >
                                        {(() => {
                                            const raw = String(d?.date ?? "").trim();
                                            if (!raw || raw === "—") return "—";
                                            if (raw.includes(".")) return raw.split(".").slice(0, 2).join(".");
                                            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(8, 10) + "." + raw.slice(5, 7);
                                            return raw;
                                        })()}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
        );
    };

    const renderChartVariantPreview = (
        data: DashboardChartPoint[],
        color: string,
        variant: DashboardChartVariant
    ) => {
        if (data.length === 0) return null;
        const values = data.map((d) => Math.max(0, Number(d.value) || 0));
        const maxValue = Math.max(...values, 1);
        const accent = '#22c55e';
        const w = 160;
        const h = 56;
        const left = 6;
        const right = 6;
        const top = 6;
        const bottom = 10;
        const plotW = w - left - right;
        const plotH = h - top - bottom;
        const n = values.length;
        const slot = plotW / Math.max(n, 1);
        const barW = Math.max(6, slot * 0.56);
        const splitA = values.map((v, i) => {
            const ratio = 0.45 + (i % 3) * 0.1;
            return Math.min(v, Math.round(v * ratio));
        });
        const splitB = values.map((v, i) => Math.max(0, v - splitA[i]));
        const maxStack = Math.max(...values.map((v, i) => splitA[i] + splitB[i]), 1);
        const points = values.map((v, i) => {
            const x = n === 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1);
            const y = top + plotH - (v / maxValue) * plotH;
            return { x, y, v };
        });
        const pointsA = splitA.map((v, i) => {
            const x = n === 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1);
            const y = top + plotH - (v / maxStack) * plotH;
            return { x, y, v };
        });
        const pointsB = splitB.map((v, i) => {
            const x = n === 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1);
            const y = top + plotH - (v / maxStack) * plotH;
            return { x, y, v };
        });
        const pointsSum = values.map((_, i) => {
            const x = n === 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1);
            const y = top + plotH - ((splitA[i] + splitB[i]) / maxStack) * plotH;
            return { x, y };
        });
        const polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');
        const polyPointsA = pointsA.map((p) => `${p.x},${p.y}`).join(' ');
        const polyPointsB = pointsB.map((p) => `${p.x},${p.y}`).join(' ');
        const areaPath = points.length > 1
            ? `M ${points[0].x} ${top + plotH} L ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${points[points.length - 1].x} ${top + plotH} Z`
            : '';
        const stackedAreaPathA = points.length > 1
            ? `M ${pointsSum[0].x} ${top + plotH} L ${pointsSum.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${pointsSum[pointsSum.length - 1].x} ${top + plotH} Z`
            : '';
        const stackedAreaPathB = points.length > 1
            ? `M ${pointsA[0].x} ${top + plotH} L ${pointsA.map((p) => `${p.x} ${p.y}`).join(' L ')} L ${pointsSum.slice().reverse().map((p) => `${p.x} ${p.y}`).join(' L ')} Z`
            : '';
        const stepPath = points.map((p, i) => {
            if (i === 0) return `M ${p.x} ${p.y}`;
            const prev = points[i - 1];
            return `L ${p.x} ${prev.y} L ${p.x} ${p.y}`;
        }).join(' ');

        if (variant === 'weekCards') {
            return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
                    {values.slice(0, 7).map((v, i) => (
                        <div key={`wk-${i}`} style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.2rem', background: 'var(--color-bg-card)' }}>
                            <div style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>д{i + 1}</div>
                            <div style={{ fontSize: 10, fontWeight: 600 }}>{Math.round(v)}</div>
                        </div>
                    ))}
                </div>
            );
        }

        if (variant === 'bulletBars') {
            const topValues = values.slice(0, 4);
            const maxTop = Math.max(...topValues, 1);
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                    {topValues.map((v, i) => (
                        <div key={`bb-${i}`} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 34px', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>d{i + 1}</span>
                            <div style={{ height: 6, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={(v / maxTop) * 100} delay={i * 0.04} style={{ background: color }} />
                            </div>
                            <span style={{ fontSize: 10, textAlign: 'right' }}>{Math.round(v)}</span>
                        </div>
                    ))}
                </div>
            );
        }

        if (variant === 'sparklineKpi') {
            return (
                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
                        <div style={{ fontSize: 10, border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.2rem' }}>рейсы: {values.length}</div>
                        <div style={{ fontSize: 10, border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.2rem' }}>пик: {Math.round(maxValue)}</div>
                        <div style={{ fontSize: 10, border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.2rem' }}>ср: {Math.round(values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1))}</div>
                    </div>
                    <svg width={w} height={44} style={{ width: '100%', height: '44px', display: 'block' }}>
                        <polyline points={polyPoints} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </div>
            );
        }

        if (variant === 'heatmap') {
            const cols = 7;
            const rows = Math.max(1, Math.ceil(values.length / cols));
            const cellW = Math.floor((w - 10) / cols);
            const cellH = Math.max(12, Math.floor((h - 10) / rows));
            return (
                <svg width={w} height={h} style={{ width: '100%', height: 'auto', display: 'block' }}>
                    {values.map((v, i) => {
                        const r = Math.floor(i / cols);
                        const c = i % cols;
                        const intensity = v / maxValue;
                        return (
                            <rect
                                key={`heat-${i}`}
                                x={5 + c * cellW}
                                y={5 + r * cellH}
                                width={cellW - 2}
                                height={cellH - 2}
                                rx={3}
                                fill={color}
                                opacity={0.15 + intensity * 0.75}
                            />
                        );
                    })}
                </svg>
            );
        }

        return (
            <svg width={w} height={h} style={{ width: '100%', height: 'auto', display: 'block' }}>
                <line x1={left} y1={top + plotH} x2={w - right} y2={top + plotH} stroke="var(--color-border)" strokeWidth="1" opacity="0.6" />
                {variant === 'columns' && values.map((v, i) => {
                    const x = left + i * slot + (slot - barW) / 2;
                    const bh = (v / maxValue) * plotH;
                    const y = top + plotH - bh;
                    return <rect key={`col-${i}`} x={x} y={y} width={barW} height={bh} rx={3} fill={color} opacity={0.75} />;
                })}
                {variant === 'groupedColumns' && values.map((_, i) => {
                    const x0 = left + i * slot + (slot - barW) / 2;
                    const half = Math.max(4, (barW - 2) / 2);
                    const hA = (splitA[i] / maxStack) * plotH;
                    const hB = (splitB[i] / maxStack) * plotH;
                    return (
                        <g key={`group-${i}`}>
                            <rect x={x0} y={top + plotH - hA} width={half} height={hA} rx={2} fill={color} opacity={0.8} />
                            <rect x={x0 + half + 2} y={top + plotH - hB} width={half} height={hB} rx={2} fill={accent} opacity={0.8} />
                        </g>
                    );
                })}
                {variant === 'stackedColumns' && values.map((_, i) => {
                    const x = left + i * slot + (slot - barW) / 2;
                    const hA = (splitA[i] / maxStack) * plotH;
                    const hB = (splitB[i] / maxStack) * plotH;
                    return (
                        <g key={`stack-${i}`}>
                            <rect x={x} y={top + plotH - hA - hB} width={barW} height={hB} rx={2} fill={accent} opacity={0.9} />
                            <rect x={x} y={top + plotH - hA} width={barW} height={hA} rx={2} fill={color} opacity={0.8} />
                        </g>
                    );
                })}
                {variant === 'stacked100' && values.map((v, i) => {
                    const x = left + i * slot + (slot - barW) / 2;
                    const pctA = v > 0 ? splitA[i] / v : 0;
                    const pctB = v > 0 ? splitB[i] / v : 0;
                    const hA = pctA * plotH;
                    const hB = pctB * plotH;
                    return (
                        <g key={`stack100-${i}`}>
                            <rect x={x} y={top + plotH - hA - hB} width={barW} height={hB} rx={2} fill={accent} opacity={0.9} />
                            <rect x={x} y={top + plotH - hA} width={barW} height={hA} rx={2} fill={color} opacity={0.8} />
                        </g>
                    );
                })}
                {variant === 'area' && areaPath && (
                    <>
                        <path d={areaPath} fill={color} opacity={0.2} />
                        <polyline points={polyPoints} fill="none" stroke={color} strokeWidth="2" />
                    </>
                )}
                {variant === 'stackedArea' && (
                    <>
                        {stackedAreaPathA && <path d={stackedAreaPathA} fill={accent} opacity={0.18} />}
                        {stackedAreaPathB && <path d={stackedAreaPathB} fill={color} opacity={0.24} />}
                        <polyline points={pointsSum.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="1.8" />
                    </>
                )}
                {variant === 'line' && <polyline points={polyPoints} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
                {variant === 'multiLine' && (
                    <>
                        <polyline points={polyPointsA} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points={polyPointsB} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                )}
                {variant === 'combo' && (
                    <>
                        {values.map((v, i) => {
                            const x = left + i * slot + (slot - barW) / 2;
                            const bh = (v / maxValue) * plotH;
                            const y = top + plotH - bh;
                            return <rect key={`combo-col-${i}`} x={x} y={y} width={barW} height={bh} rx={3} fill={color} opacity={0.32} />;
                        })}
                        <polyline points={polyPoints} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
                    </>
                )}
                {variant === 'step' && <path d={stepPath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                {variant === 'lollipop' && points.map((p, i) => (
                    <g key={`lp-${i}`}>
                        <line x1={p.x} y1={top + plotH} x2={p.x} y2={p.y} stroke={color} strokeWidth="2" opacity="0.45" />
                        <circle cx={p.x} cy={p.y} r="3.6" fill={color} />
                    </g>
                ))}
                {variant === 'dot' && points.map((p, i) => (
                    <circle key={`dot-${i}`} cx={p.x} cy={p.y} r="3.2" fill={color} opacity="0.88" />
                ))}
            </svg>
        );
    };

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
    }, [WIDGET_3_CHART, showOnlySla, showSums, loading, error, chartData.length, mainChartVariant, chartType]);
    
    const formatStripValue = (): string => {
        if (chartType === 'money') return `${Math.round(stripTotals.sum || 0).toLocaleString('ru-RU')} ₽`;
        if (chartType === 'paidWeight') return `${Math.round(stripTotals.pw || 0).toLocaleString('ru-RU')} кг`;
        if (chartType === 'weight') return `${Math.round(stripTotals.w || 0).toLocaleString('ru-RU')} кг`;
        if (chartType === 'pieces') return `${Math.round(stripTotals.mest || 0).toLocaleString('ru-RU')} шт`;
        const vol = Number(stripTotals.vol);
        return `${(isNaN(vol) ? 0 : vol).toFixed(2).replace('.', ',')} м³`;
    };

    /** Тренд период к периоду: текущий период vs предыдущий период (только в служебном режиме) */
    const periodToPeriodTrend = useMemo(() => {
        if (!useServiceRequest || filteredPrevPeriodItems.length === 0) return null;
        
        const getVal = (item: CargoItem) => {
            if (chartType === 'money') return typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            if (chartType === 'paidWeight') return typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            if (chartType === 'weight') return typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            if (chartType === 'pieces') return typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            return typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
        };
        
        const currentVal = filteredItems.reduce((acc, item) => acc + getVal(item), 0);
        const prevVal = filteredPrevPeriodItems.reduce((acc, item) => acc + getVal(item), 0);
        
        if (prevVal === 0) return currentVal > 0 ? { direction: 'up', percent: 100 } : null;
        
        const percent = Math.round(((currentVal - prevVal) / prevVal) * 100);
        return {
            direction: currentVal > prevVal ? 'up' : currentVal < prevVal ? 'down' : null,
            percent: Math.abs(percent),
        };
    }, [useServiceRequest, filteredItems, filteredPrevPeriodItems, chartType]);

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

    // ═══════ Служебные виджеты (только useServiceRequest) ═══════

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
        filteredItems.forEach((item) => {
            const k = getFilterKeyByStatus(item.State);
            counts.set(k, (counts.get(k) || 0) + 1);
        });
        return stages.map((s) => ({ ...s, count: counts.get(s.key) || 0 }));
    }, [filteredItems, useServiceRequest]);

    type FunnelCustomerRow = { customer: string; count: number; sum: number };
    const statusFunnelCustomersTable = useMemo(() => {
        if (!useServiceRequest) return {} as Record<string, FunnelCustomerRow[]>;
        const byStatus = new Map<string, Map<string, { count: number; sum: number }>>();
        filteredItems.forEach((item) => {
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
    }, [filteredItems, useServiceRequest]);

    /** Перевозки по (статус, заказчик) для раскрытия при клике */
    const statusFunnelItemsByCustomer = useMemo(() => {
        if (!useServiceRequest) return {} as Record<string, Record<string, any[]>>;
        const result: Record<string, Record<string, any[]>> = {};
        filteredItems.forEach((item) => {
            const statusKey = getFilterKeyByStatus(item.State);
            const customer = stripOoo((item.Customer ?? (item as any).customer ?? '').trim() || '—');
            if (!result[statusKey]) result[statusKey] = {};
            if (!result[statusKey][customer]) result[statusKey][customer] = [];
            result[statusKey][customer].push(item);
        });
        return result;
    }, [filteredItems, useServiceRequest]);

    const paretoByCustomer = useMemo(() => {
        if (!useServiceRequest) return { rows: [] as { name: string; value: number; cumPercent: number; color: string }[], total: 0 };
        const map = new Map<string, number>();
        filteredItems.forEach((item) => {
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
    }, [filteredItems, useServiceRequest]);

    type AgingInvoice = { number: string; customer: string; date: string; sum: number; days: number; status: string; shipmentStatus: string; route: string };
    const invoiceAging = useMemo(() => {
        if (!useServiceRequest) return { buckets: [] as { label: string; count: number; sum: number; color: string; items: AgingInvoice[] }[], total: 0 };
        const cargoStateByNumber = buildCargoStateByNumber(items);
        const now = new Date();
        const buckets = [
            { label: 'до 7 дн.', min: 0, max: 7, count: 0, sum: 0, color: '#10b981', items: [] as AgingInvoice[] },
            { label: '7–14 дн.', min: 7, max: 14, count: 0, sum: 0, color: '#f59e0b', items: [] as AgingInvoice[] },
            { label: '14–30 дн.', min: 14, max: 30, count: 0, sum: 0, color: '#f97316', items: [] as AgingInvoice[] },
            { label: '30+ дн.', min: 30, max: Infinity, count: 0, sum: 0, color: '#ef4444', items: [] as AgingInvoice[] },
        ];
        let total = 0;
        (calendarInvoiceItems ?? []).forEach((inv: any) => {
            const status = normalizeInvoiceStatus(inv?.Status ?? inv?.State ?? inv?.state ?? inv?.Статус ?? inv?.status ?? inv?.PaymentStatus ?? '');
            if (status === 'Оплачен') return;
            const rawDate = String(inv?.DateDoc ?? inv?.Date ?? inv?.date ?? inv?.dateDoc ?? inv?.Дата ?? '').trim();
            const parsed = dateUtils.parseDateOnly(rawDate);
            if (!parsed) return;
            const days = Math.max(0, Math.round((now.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000)));
            const sum = typeof inv?.SumDoc === 'string' ? parseFloat(inv.SumDoc) || 0 : Number(inv?.SumDoc ?? inv?.Sum ?? inv?.sum ?? inv?.Сумма ?? 0) || 0;
            if (sum <= 0) return;
            const invNum = String(inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? '').trim() || '—';
            const customer = String(inv?.Customer ?? inv?.customer ?? inv?.Контрагент ?? inv?.Contractor ?? '').trim() || '—';
            const dateStr = dateUtils.formatDate(rawDate);
            const dirRaw = String(inv?.Direction ?? inv?.direction ?? inv?.Направление ?? '').trim().toUpperCase();
            const senderCode = cityToCode(inv?.CitySender ?? inv?.citySender ?? inv?.ГородОтправителя ?? inv?.city_from ?? '');
            const receiverCode = cityToCode(inv?.CityReceiver ?? inv?.cityReceiver ?? inv?.ГородПолучателя ?? inv?.city_to ?? '');
            const route = dirRaw.includes('MSK_TO_KGD') || dirRaw.includes('MSK-KGD')
                ? 'MSK-KGD'
                : dirRaw.includes('KGD_TO_MSK') || dirRaw.includes('KGD-MSK')
                    ? 'KGD-MSK'
                    : (senderCode && receiverCode ? `${senderCode}-${receiverCode}` : '—');
            const cargoNum = getFirstCargoNumberFromInvoice(inv);
            const rawShipmentState = cargoNum ? cargoStateByNumber.get(cargoNum) ?? cargoStateByNumber.get(cargoNum.replace(/^0+/, '') ?? '') : undefined;
            const shipmentStatus = rawShipmentState ? normalizeStatus(rawShipmentState) : '—';
            for (const b of buckets) {
                if (days >= b.min && days < b.max) {
                    b.count += 1;
                    b.sum += sum;
                    total += sum;
                    b.items.push({ number: invNum, customer: stripOoo(customer), date: dateStr, sum, days, status, shipmentStatus, route });
                    break;
                }
            }
        });
        buckets.forEach((b) => b.items.sort((a, b2) => b2.sum - a.sum));
        return { buckets, total };
    }, [calendarInvoiceItems, items, useServiceRequest]);

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
        items.forEach((item) => {
            _dbgTotal++;
            if (isReceivedInfoStatus(item.State)) { _dbgRecv++; return; }
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
    }, [items, useServiceRequest, heatmapMonth]);

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
    }, [useServiceRequest, loading, error, showOnlySla, movingAverage7, maChartType]);

    const repeatCustomers = useMemo(() => {
        if (!useServiceRequest || filteredPrevPeriodItems.length === 0) return null;
        const current = new Set<string>();
        const previous = new Set<string>();
        filteredItems.forEach((item) => {
            const name = (item.Customer ?? (item as any).customer ?? '').trim();
            if (name) current.add(name);
        });
        filteredPrevPeriodItems.forEach((item) => {
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
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest]);

    const weekdayDistribution = useMemo(() => {
        if (!useServiceRequest) return [];
        const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        const ferry = [0, 0, 0, 0, 0, 0, 0];
        const auto = [0, 0, 0, 0, 0, 0, 0];
        const weights = [0, 0, 0, 0, 0, 0, 0];
        filteredItems.forEach((item) => {
            const raw = String(item.DatePrih ?? '').trim();
            if (!raw) return;
            const dk = raw.includes('T') ? raw.split('T')[0] : raw;
            const p = dateUtils.parseDateOnly(dk);
            if (!p) return;
            const dow = (p.getDay() + 6) % 7;
            if (isFerry(item)) { ferry[dow] += 1; } else { auto[dow] += 1; }
            weights[dow] += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        });
        const maxCount = Math.max(...ferry.map((f, i) => f + auto[i]), 1);
        return DAYS.map((label, i) => ({
            label, count: ferry[i] + auto[i], ferry: ferry[i], auto: auto[i],
            pw: weights[i], percent: Math.round(((ferry[i] + auto[i]) / maxCount) * 100),
            ferryPct: Math.round((ferry[i] / maxCount) * 100),
            autoPct: Math.round((auto[i] / maxCount) * 100),
        }));
    }, [filteredItems, useServiceRequest]);

    // ═══════ CLIENT ANALYTICS DATA ═══════

    const clientItems = useMemo(() => filteredItems, [filteredItems]);
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

    const churnRisk = useMemo(() => {
        if (!useServiceRequest || clientItems.length === 0) return null;
        const byCustomer = new Map<string, Date[]>();
        clientItems.forEach(item => {
            const name = getCustomerName(item);
            if (!name) return;
            const d = getItemDate(item);
            if (!d) return;
            if (!byCustomer.has(name)) byCustomer.set(name, []);
            byCustomer.get(name)!.push(d);
        });
        const now = new Date();
        const results: { name: string; avgInterval: number; lastInterval: number; daysSinceLast: number; zone: 'green' | 'yellow' | 'red'; orders: number }[] = [];
        byCustomer.forEach((dates, name) => {
            if (dates.length < 2) {
                const daysSinceLast = Math.round((now.getTime() - Math.max(...dates.map(d => d.getTime()))) / 86400000);
                results.push({ name, avgInterval: 0, lastInterval: 0, daysSinceLast, zone: daysSinceLast > 90 ? 'red' : daysSinceLast > 45 ? 'yellow' : 'green', orders: 1 });
                return;
            }
            dates.sort((a, b) => a.getTime() - b.getTime());
            const intervals: number[] = [];
            for (let i = 1; i < dates.length; i++) {
                intervals.push(Math.round((dates[i].getTime() - dates[i - 1].getTime()) / 86400000));
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const lastInterval = intervals[intervals.length - 1];
            const daysSinceLast = Math.round((now.getTime() - dates[dates.length - 1].getTime()) / 86400000);
            let zone: 'green' | 'yellow' | 'red' = 'green';
            if (avgInterval <= 0) {
                // Fallback for edge-cases: evaluate risk by absolute thresholds only.
                if (daysSinceLast > 90) zone = 'red';
                else if (daysSinceLast > 45) zone = 'yellow';
            } else {
                if (daysSinceLast > avgInterval * 3 || daysSinceLast > 90) zone = 'red';
                else if (daysSinceLast > avgInterval * 2 || daysSinceLast > 45) zone = 'yellow';
            }
            results.push({ name, avgInterval: Math.round(avgInterval), lastInterval, daysSinceLast, zone, orders: dates.length });
        });
        results.sort((a, b) => {
            const z = { red: 0, yellow: 1, green: 2 };
            return z[a.zone] - z[b.zone] || b.daysSinceLast - a.daysSinceLast;
        });
        return {
            items: results,
            red: results.filter(r => r.zone === 'red').length,
            yellow: results.filter(r => r.zone === 'yellow').length,
            green: results.filter(r => r.zone === 'green').length,
        };
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

    const clientGeography = useMemo(() => {
        if (!useServiceRequest || clientItems.length === 0) return null;
        const routes = new Map<string, { count: number; pw: number; sum: number }>();
        const cities = new Map<string, { sent: number; received: number }>();
        clientItems.forEach(item => {
            const from = (item.CitySender ?? '').trim() || '—';
            const to = (item.CityReceiver ?? '').trim() || '—';
            const rKey = `${from} → ${to}`;
            const rEntry = routes.get(rKey) || { count: 0, pw: 0, sum: 0 };
            rEntry.count += 1; rEntry.pw += getItemPw(item); rEntry.sum += getItemSum(item);
            routes.set(rKey, rEntry);
            const fromE = cities.get(from) || { sent: 0, received: 0 }; fromE.sent += 1; cities.set(from, fromE);
            const toE = cities.get(to) || { sent: 0, received: 0 }; toE.received += 1; cities.set(to, toE);
        });
        const topRoutes = [...routes.entries()].map(([route, v]) => ({ route, ...v })).sort((a, b) => b.count - a.count).slice(0, 10);
        const topCities = [...cities.entries()].map(([city, v]) => ({ city, total: v.sent + v.received, ...v })).sort((a, b) => b.total - a.total).slice(0, 10);
        return { topRoutes, topCities };
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

    if (!auth?.login || !auth?.password) {
        return (
            <div className="w-full p-4">
                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нет доступа к дашборду. Выберите аккаунт в профиле.</Typography.Body>
            </div>
        );
    }

    return (
        <div className="w-full dashboard-page-offset">
            {/* === ВИДЖЕТ 1: Фильтры (включить: WIDGET_1_FILTERS = true) === */}
            {WIDGET_1_FILTERS && (
            <div className="cargo-page-sticky-header dashboard-sticky-filters" style={{ marginBottom: 0 }}>
            <div className="filters-container filters-row-scroll">
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Дата: {dateFilter === 'период' ? 'Период' : dateFilter === 'месяц' && selectedMonthForFilter ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}` : dateFilter === 'год' && selectedYearForFilter ? `${selectedYearForFilter}` : dateFilter === 'неделя' && selectedWeekForFilter ? (() => { const r = getWeekRange(selectedWeekForFilter); return `${r.dateFrom.slice(8,10)}.${r.dateFrom.slice(5,7)} – ${r.dateTo.slice(8,10)}.${r.dateTo.slice(5,7)}`; })() : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={dateButtonRef} isOpen={isDateDropdownOpen} onClose={() => setIsDateDropdownOpen(false)}>
                        {dateDropdownMode === 'months' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {MONTH_NAMES.map((name, i) => (
                                    <div key={i} className="dropdown-item" onClick={() => {
                                        const year = new Date().getFullYear();
                                        setDateFilter('месяц');
                                        setSelectedMonthForFilter({ year, month: i + 1 });
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{name} {new Date().getFullYear()}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : dateDropdownMode === 'years' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {getYearsList(6).map(y => (
                                    <div key={y} className="dropdown-item" onClick={() => {
                                        setDateFilter('год');
                                        setSelectedYearForFilter(y);
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{y}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : dateDropdownMode === 'weeks' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {getWeeksList(16).map(w => (
                                    <div key={w.monday} className="dropdown-item" onClick={() => {
                                        setDateFilter('неделя');
                                        setSelectedWeekForFilter(w.monday);
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{w.label}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : (
                            ['сегодня', 'вчера', 'неделя', 'месяц', 'год', 'период'].map(key => {
                                const isMonth = key === 'месяц';
                                const isYear = key === 'год';
                                const isWeek = key === 'неделя';
                                const doLongPress = isMonth || isYear || isWeek;
                                const timerRef = isMonth ? monthLongPressTimerRef : isYear ? yearLongPressTimerRef : weekLongPressTimerRef;
                                const wasLongPressRef = isMonth ? monthWasLongPressRef : isYear ? yearWasLongPressRef : weekWasLongPressRef;
                                const mode = isMonth ? 'months' : isYear ? 'years' : 'weeks';
                                const title = isMonth ? 'Клик — текущий месяц; удерживайте — выбор месяца' : isYear ? 'Клик — 365 дней; удерживайте — выбор года' : isWeek ? 'Клик — предыдущая неделя; удерживайте — выбор недели (пн–вс)' : undefined;
                                return (
                                    <div key={key} className="dropdown-item" title={title}
                                        onPointerDown={doLongPress ? () => {
                                            wasLongPressRef.current = false;
                                            timerRef.current = setTimeout(() => {
                                                timerRef.current = null;
                                                wasLongPressRef.current = true;
                                                setDateDropdownMode(mode);
                                            }, 500);
                                        } : undefined}
                                        onPointerUp={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                        onPointerLeave={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                        onClick={() => {
                                            if (doLongPress && wasLongPressRef.current) { wasLongPressRef.current = false; return; }
                                            if (key === 'период') {
                                                let r: { dateFrom: string; dateTo: string };
                                                if (dateFilter === "период") {
                                                    r = { dateFrom: customDateFrom, dateTo: customDateTo };
                                                } else if (dateFilter === "месяц" && selectedMonthForFilter) {
                                                    const { year, month } = selectedMonthForFilter;
                                                    const pad = (n: number) => String(n).padStart(2, '0');
                                                    const lastDay = new Date(year, month, 0).getDate();
                                                    r = { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                                                } else if (dateFilter === "год" && selectedYearForFilter) {
                                                    r = { dateFrom: `${selectedYearForFilter}-01-01`, dateTo: `${selectedYearForFilter}-12-31` };
                                                } else if (dateFilter === "неделя" && selectedWeekForFilter) {
                                                    r = getWeekRange(selectedWeekForFilter);
                                                } else {
                                                    r = getDateRange(dateFilter);
                                                }
                                                setCustomDateFrom(r.dateFrom);
                                                setCustomDateTo(r.dateTo);
                                            }
                                            setDateFilter(key as any);
                                            if (key === 'месяц') setSelectedMonthForFilter(null);
                                            if (key === 'год') setSelectedYearForFilter(null);
                                            if (key === 'неделя') setSelectedWeekForFilter(null);
                                            setIsDateDropdownOpen(false);
                                            if (key === 'период') setIsCustomModalOpen(true);
                                        }}
                                    >
                                        <Typography.Body>{key === 'год' ? 'Год' : key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                    </div>
                                );
                            })
                        )}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Статус: {STATUS_MAP[statusFilter] ?? 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={statusButtonRef} isOpen={isStatusDropdownOpen} onClose={() => setIsStatusDropdownOpen(false)}>
                        {Object.keys(STATUS_MAP).map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setStatusFilter(key as any); setIsStatusDropdownOpen(false); }}>
                                <Typography.Body>{STATUS_MAP[key as StatusFilter]}</Typography.Body>
                            </div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={senderButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsSenderDropdownOpen(!isSenderDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Отправитель: {senderFilter ? stripOoo(senderFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={senderButtonRef} isOpen={isSenderDropdownOpen} onClose={() => setIsSenderDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setSenderFilter(''); setIsSenderDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueSenders.map(s => (
                            <div key={s} className="dropdown-item" onClick={() => { setSenderFilter(s); setIsSenderDropdownOpen(false); }}><Typography.Body>{stripOoo(s)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={receiverButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsReceiverDropdownOpen(!isReceiverDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Получатель: {receiverFilter ? stripOoo(receiverFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={receiverButtonRef} isOpen={isReceiverDropdownOpen} onClose={() => setIsReceiverDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setReceiverFilter(''); setIsReceiverDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueReceivers.map(r => (
                            <div key={r} className="dropdown-item" onClick={() => { setReceiverFilter(r); setIsReceiverDropdownOpen(false); }}><Typography.Body>{stripOoo(r)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                {useServiceRequest && (
                    <div className="filter-group" style={{ flexShrink: 0 }}>
                        <div ref={billStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsBillStatusDropdownOpen(!isBillStatusDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                Статус счёта: {BILL_STATUS_MAP[billStatusFilter]} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={billStatusButtonRef} isOpen={isBillStatusDropdownOpen} onClose={() => setIsBillStatusDropdownOpen(false)}>
                            {(['all', 'paid', 'unpaid', 'partial', 'cancelled', 'unknown'] as const).map(key => (
                                <div key={key} className="dropdown-item" onClick={() => { setBillStatusFilter(key); setIsBillStatusDropdownOpen(false); }}>
                                    <Typography.Body>{BILL_STATUS_MAP[key]}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                    </div>
                )}
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={typeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Тип: {typeFilter === 'all' ? 'Все' : typeFilter === 'ferry' ? 'Паром' : 'Авто'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={typeButtonRef} isOpen={isTypeDropdownOpen} onClose={() => setIsTypeDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('all'); setIsTypeDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('ferry'); setIsTypeDropdownOpen(false); }}><Typography.Body>Паром</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('auto'); setIsTypeDropdownOpen(false); }}><Typography.Body>Авто</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={routeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsRouteDropdownOpen(!isRouteDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); }}>
                            Маршрут: {routeFilter === 'all' ? 'Все' : routeFilter} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={routeButtonRef} isOpen={isRouteDropdownOpen} onClose={() => setIsRouteDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('all'); setIsRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('MSK-KGD'); setIsRouteDropdownOpen(false); }}><Typography.Body>MSK – KGD</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('KGD-MSK'); setIsRouteDropdownOpen(false); }}><Typography.Body>KGD – MSK</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
            </div>
            </div>
            )}

            <DashboardMotionGroup enabled={dashboardMotionEnabled}>
            {/* === ВИДЖЕТ 2: Полоска с периодом и типом графика (включить: WIDGET_2_STRIP = true) === */}
            {WIDGET_2_STRIP && showSums && (
            <DashboardMotionItem enabled={dashboardMotionEnabled}>
            <>
            {useServiceRequest && (
                <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>Приемка</Typography.Body>
            )}
            {/* Раскрывающаяся полоска: в свёрнутом виде — период + переключатели; в развёрнутом — переключатель и диаграммы */}
            <div
                className="home-strip"
                style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    marginBottom: '1rem',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        minWidth: 0,
                    }}
                >
                    <span style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Typography.Body style={{ color: 'var(--color-primary-blue)', fontWeight: 600, fontSize: '0.6rem' }}>
                            <DateText value={apiDateRange.dateFrom} /> – <DateText value={apiDateRange.dateTo} />
                        </Typography.Body>
                    </span>
                    <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }}>
                        {showSums && (
                            <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none' }} onClick={() => setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        )}
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none' }} onClick={() => setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none' }} onClick={() => setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none' }} onClick={() => setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none' }} onClick={() => setChartType('pieces')} title="Шт"><Package className="w-4 h-4" style={{ color: chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    </Flex>
                </div>
                {(
                    <div style={{ padding: '1.25rem 1rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                        <Flex align="center" gap="0.5rem" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            {dateFilter === 'неделя' && (
                                <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem', color: 'var(--color-text-secondary)', marginRight: '0.5rem' }}>За неделю:</Typography.Body>
                            )}
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem' }}>{formatStripValue()}</Typography.Body>
                            {useServiceRequest && prevPeriodLoading && (
                                <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }} title="Расчёт динамики">
                                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                </Flex>
                            )}
                            {useServiceRequest && !prevPeriodLoading && periodToPeriodTrend && (
                                <>
                                    {periodToPeriodTrend.direction === 'up' && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)', fontWeight: 600 }}>
                                                +{periodToPeriodTrend.percent}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    {periodToPeriodTrend.direction === 'down' && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 600 }}>
                                                -{periodToPeriodTrend.percent}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    {periodToPeriodTrend.direction === null && periodToPeriodTrend.percent === 0 && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <Minus className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                                0%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                </>
                            )}
                            {!useServiceRequest && (
                                <>
                                    {stripTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)', flexShrink: 0 }} title="Тренд вверх (вторая половина периода больше первой)" />}
                                    {stripTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444', flexShrink: 0 }} title="Тренд вниз (вторая половина периода меньше первой)" />}
                                    {stripTrend === null && chartData.length >= 2 && <Minus className="w-5 h-5" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} title="Без выраженного тренда" />}
                                </>
                            )}
                        </Flex>
                        <div style={{ marginBottom: '0.75rem', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                            <Flex gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                                {((useServiceRequest ? ['type', 'sender', 'receiver', 'customer'] : ['type', 'sender', 'receiver']) as const).map((tab) => (
                                    <Button
                                        key={tab}
                                        className="filter-button"
                                        style={{
                                            flexShrink: 0,
                                            padding: '0.5rem 0.75rem',
                                            background: stripTab === tab ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                            color: stripTab === tab ? 'white' : 'var(--color-text-primary)',
                                            border: stripTab === tab ? '1px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                                        }}
                                        onClick={() => setStripTab(tab)}
                                    >
                                        {tab === 'type' ? 'Тип' : tab === 'sender' ? 'Отправитель' : tab === 'receiver' ? 'Получатель' : 'Заказчик'}
                                    </Button>
                                ))}
                            </Flex>
                        </div>
                        <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                            {stripTab === 'type' && stripDiagramByType.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, width: 56 }}>{row.label}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                                    >
                                        {!showSums || stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'sender' && stripDiagramBySender.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                                    >
                                        {!showSums || stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'receiver' && stripDiagramByReceiver.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                                    >
                                        {!showSums || stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'customer' && stripDiagramByCustomer.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                                    >
                                        {!showSums || stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                        </div>
                        {stripLineChartData && (
                            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--color-border)' }}>
                                <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginBottom: '0.45rem' }}>
                                    Динамика по датам (X — даты, Y — сумма, ₽)
                                </Typography.Body>
                                <div style={{ overflowX: 'auto' }}>
                                    {(() => {
                                        const chartWidth = Math.max(560, stripLineChartData.dates.length * 56);
                                        const chartHeight = 250;
                                        const left = 56;
                                        const right = 14;
                                        const top = 12;
                                        const bottom = 50;
                                        const innerW = chartWidth - left - right;
                                        const innerH = chartHeight - top - bottom;
                                        const xStep = stripLineChartData.dates.length > 1 ? innerW / (stripLineChartData.dates.length - 1) : 0;
                                        const yTicks = 4;
                                        const xLabelStep = Math.max(1, Math.ceil(stripLineChartData.dates.length / 6));
                                        const xLabel = (dateKey: string) => {
                                            const parts = dateKey.split('-');
                                            if (parts.length !== 3) return dateKey;
                                            return `${parts[2]}.${parts[1]}`;
                                        };
                                        return (
                                            <svg width={chartWidth} height={chartHeight} style={{ display: 'block', minWidth: `${chartWidth}px` }}>
                                                {Array.from({ length: yTicks + 1 }).map((_, idx) => {
                                                    const ratio = idx / yTicks;
                                                    const y = top + innerH * (1 - ratio);
                                                    const value = stripLineChartData.maxY * ratio;
                                                    return (
                                                        <g key={`y-grid-${idx}`}>
                                                            <line x1={left} y1={y} x2={chartWidth - right} y2={y} stroke="var(--color-border)" strokeOpacity={0.55} strokeDasharray="3 3" />
                                                            <text x={left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--color-text-secondary)">
                                                                {Math.round(value).toLocaleString('ru-RU')}
                                                            </text>
                                                        </g>
                                                    );
                                                })}
                                                {stripLineChartData.series.map((line) => {
                                                    const points = line.values.map((val, idx) => ({
                                                        x: left + xStep * idx,
                                                        y: top + innerH - (val / stripLineChartData.maxY) * innerH,
                                                        val,
                                                    }));
                                                    const d = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                                                    return (
                                                        <g key={line.name}>
                                                            <path d={d} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" />
                                                            {points.map((p, idx) => (
                                                                <circle key={`${line.name}-${idx}`} cx={p.x} cy={p.y} r={2.5} fill={line.color}>
                                                                    <title>{`${line.name}: ${Math.round(p.val).toLocaleString('ru-RU')} ₽`}</title>
                                                                </circle>
                                                            ))}
                                                        </g>
                                                    );
                                                })}
                                                {stripLineChartData.dates.map((date, idx) => {
                                                    if (idx % xLabelStep !== 0 && idx !== stripLineChartData.dates.length - 1) return null;
                                                    const x = left + xStep * idx;
                                                    return (
                                                        <text key={`x-${date}-${idx}`} x={x} y={chartHeight - 18} textAnchor="middle" fontSize="10" fill="var(--color-text-secondary)">
                                                            {xLabel(date)}
                                                        </text>
                                                    );
                                                })}
                                            </svg>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Монитор доставки: только статус «доставлено» в выбранном периоде (только в служебном режиме, без заказчика). Пока скрыт. */}
            {false && useServiceRequest && (
            <>
            <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.35rem', marginTop: '0.5rem' }}>Доставка</Typography.Body>
            <div className="home-strip" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', marginBottom: '1rem', overflow: 'hidden' }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.75rem 1rem', minWidth: 0 }}>
                    <Typography.Body style={{ color: 'var(--color-primary-blue)', fontWeight: 600, fontSize: '0.6rem' }}>
                        <DateText value={apiDateRange.dateFrom} /> – <DateText value={apiDateRange.dateTo} /> — Доставлено
                    </Typography.Body>
                    <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }}>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none' }} onClick={() => setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none' }} onClick={() => setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none' }} onClick={() => setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none' }} onClick={() => setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none' }} onClick={() => setChartType('pieces')} title="Шт"><Package className="w-4 h-4" style={{ color: chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    </Flex>
                </div>
                <div style={{ padding: '1.25rem 1rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                    <Flex align="center" gap="0.5rem" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem' }}>
                            {chartType === 'money' ? `${Math.round(deliveryStripTotals.sum || 0).toLocaleString('ru-RU')} ₽` : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(deliveryStripTotals.pw || 0).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(deliveryStripTotals.mest || 0).toLocaleString('ru-RU')} шт` : `${(deliveryStripTotals.vol || 0).toFixed(2).replace('.', ',')} м³`}
                        </Typography.Body>
                    </Flex>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <Flex gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                            {(['type', 'sender', 'receiver'] as const).map((tab) => (
                                <Button key={tab} className="filter-button" style={{ flexShrink: 0, padding: '0.5rem 0.75rem', background: deliveryStripTab === tab ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)', color: deliveryStripTab === tab ? 'white' : 'var(--color-text-primary)', border: deliveryStripTab === tab ? '1px solid var(--color-primary-blue)' : '1px solid var(--color-border)' }} onClick={() => setDeliveryStripTab(tab)}>
                                    {tab === 'type' ? 'Тип' : tab === 'sender' ? 'Отправитель' : 'Получатель'}
                                </Button>
                            ))}
                        </Flex>
                    </div>
                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        {deliveryStripTab === 'type' && deliveryStripDiagramByType.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, width: 140 }}>{row.label}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); setDeliveryStripShowAsPercent(p => !p); }} title={deliveryStripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах'}>
                                    {deliveryStripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                        {deliveryStripTab === 'sender' && deliveryStripDiagramBySender.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); setDeliveryStripShowAsPercent(p => !p); }}>
                                    {deliveryStripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                        {deliveryStripTab === 'receiver' && deliveryStripDiagramByReceiver.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); setDeliveryStripShowAsPercent(p => !p); }}>
                                    {deliveryStripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            </>
            )}
            </>
            </DashboardMotionItem>
            )}

            <DashboardMotionItem enabled={dashboardMotionEnabled}>
            {loading && (
                <Flex justify="center" className="text-center py-8">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
                </Flex>
            )}
            
            {error && (
                <Flex align="center" className="login-error mt-4">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <Typography.Body>{error}</Typography.Body>
                </Flex>
            )}
            
            {/* ═══════ ГРУППА 1: ОБЗОР И ТРЕНДЫ ═══════ */}
            
            {/* === ВИДЖЕТ 3: График динамики (включить: WIDGET_3_CHART = true) === */}
            {WIDGET_3_CHART && !loading && !error && showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
                    <Flex align="center" justify="space-between" style={{ marginBottom: '0.15rem' }}>
                        <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600 }}>
                            {selectedChartConfig.title}
                        </Typography.Headline>
                        <Flex gap="0.2rem" align="center">
                            {showSums && (
                                <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            )}
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setChartType('pieces')} title="Места (шт)"><Package className="w-4 h-4" style={{ color: chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        </Flex>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                        Динамика показателя по дням за выбранный период. Выберите стиль отображения ниже.
                    </Typography.Body>
                    <div ref={mainChartWrapRef} style={{ width: '100%', minWidth: 0 }}>
                        {renderChart(selectedChartConfig.data, selectedChartConfig.title, selectedChartConfig.color, selectedChartConfig.formatValue, mainChartVariant, mainChartOuterWidthPx)}
                    </div>
                    <div style={{ marginTop: '0.85rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.7rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                            Стиль графика (нажми на миниатюру)
                        </Typography.Body>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.35rem' }}>
                            {([
                                { key: 'columns', label: 'Столбцы' },
                                { key: 'line', label: 'Линия' },
                                { key: 'area', label: 'Область' },
                                { key: 'combo', label: 'Комбо: столбцы + линия' },
                                { key: 'dot', label: 'Точки' },
                            ] as { key: MainChartVariant; label: string }[]).map((variant) => (
                                <button
                                    key={`variant-${variant.key}`}
                                    type="button"
                                    className="filter-button"
                                    onClick={() => setMainChartVariant(variant.key)}
                                    style={{
                                        border: variant.key === mainChartVariant ? '1px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                                        borderRadius: 6,
                                        padding: '0.22rem',
                                        background: variant.key === mainChartVariant ? 'rgba(37,99,235,0.08)' : 'var(--color-bg-hover)',
                                        textAlign: 'left',
                                    }}
                                    title={`Выбрать: ${variant.label}`}
                                >
                                    <Typography.Body style={{ fontSize: '0.62rem', marginBottom: '0.15rem', color: 'var(--color-text-secondary)' }}>
                                        {variant.label}
                                    </Typography.Body>
                                    {renderChartVariantPreview(selectedChartConfig.data, selectedChartConfig.color, variant.key)}
                                </button>
                            ))}
                        </div>
                    </div>
                </Panel>
            )}

            {/* 7. Скользящая средняя (overlay на основной график) */}
            {useServiceRequest && !loading && !error && movingAverage7 && movingAverage7.length > 2 && !showOnlySla && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                        <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600 }}>
                            Скользящая средняя (7 дн.)
                        </Typography.Headline>
                        <Flex gap="0.2rem" align="center">
                            {showSums && (
                                <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: maChartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setMaChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: maChartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            )}
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: maChartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setMaChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: maChartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: maChartType === 'weight' ? '#0d9488' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setMaChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: maChartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: maChartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setMaChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: maChartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: maChartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => setMaChartType('pieces')} title="Места (шт)"><Package className="w-4 h-4" style={{ color: maChartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        </Flex>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Тренд без дневных колебаний — {maChartType === 'money' ? 'выручка (₽)' : maChartType === 'paidWeight' ? 'платный вес (кг)' : maChartType === 'weight' ? 'вес (кг)' : maChartType === 'pieces' ? 'места (шт)' : 'объём (м³)'}
                    </Typography.Body>
                    {(() => {
                        const pts = movingAverage7;
                        const maxVal = Math.max(...pts.map((p) => p.value), 1);
                        const w = Math.max(280, Math.floor(maChartOuterWidthPx));
                        const h = 100;
                        const pad = { l: 50, r: 16, t: 10, b: 26 };
                        const plotW = w - pad.l - pad.r;
                        const plotH = h - pad.t - pad.b;
                        const polyPts = pts.map((p, i) => {
                            const x = pad.l + (pts.length > 1 ? (i * plotW) / (pts.length - 1) : plotW / 2);
                            const y = pad.t + plotH - (p.value / maxVal) * plotH;
                            return `${x},${y}`;
                        }).join(' ');
                        const areaD = pts.length > 1
                            ? `M ${pad.l} ${pad.t + plotH} L ${pts.map((p, i) => { const x = pad.l + (i * plotW) / (pts.length - 1); const y = pad.t + plotH - (p.value / maxVal) * plotH; return `${x} ${y}`; }).join(' L ')} L ${pad.l + plotW} ${pad.t + plotH} Z`
                            : '';
                        return (
                            <div ref={maChartWrapRef} style={{ width: '100%', minWidth: 0, overflowX: 'auto' }}>
                                <svg
                                    viewBox={`0 0 ${w} ${h}`}
                                    width="100%"
                                    height={h}
                                    preserveAspectRatio="xMinYMid meet"
                                    style={{ display: 'block', maxWidth: '100%' }}
                                >
                                    <line x1={pad.l} y1={pad.t + plotH} x2={w - pad.r} y2={pad.t + plotH} stroke="var(--color-border)" strokeWidth="1" opacity="0.5" />
                                    {areaD && <path d={areaD} fill="#7c3aed" opacity="0.12" />}
                                    <polyline points={polyPts} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    {pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 8)) === 0 || i === pts.length - 1).map((p, i) => {
                                        const idx = pts.indexOf(p);
                                        const x = pad.l + (pts.length > 1 ? (idx * plotW) / (pts.length - 1) : plotW / 2);
                                        const raw = String(p?.date ?? '').trim();
                                        const label = raw.includes('.') ? raw.split('.').slice(0, 2).join('.') : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(8) + '.' + raw.slice(5, 7) : raw;
                                        return <text key={`ma-lbl-${i}`} x={x} y={h - 6} textAnchor="middle" fontSize="9" fill="var(--color-text-secondary)">{label}</text>;
                                    })}
                                    <text x={pad.l - 4} y={pad.t + 4} textAnchor="end" fontSize="9" fill="var(--color-text-secondary)">{maChartType === 'money' ? formatCurrency(maxVal, true) : `${maxVal.toLocaleString('ru-RU')} ${maChartType === 'volume' ? 'м³' : maChartType === 'pieces' ? 'шт' : 'кг'}`}</text>
                                </svg>
                            </div>
                        );
                    })()}
                </Panel>
            )}

            {/* ═══════ ГРУППА 2: ОПЕРАЦИОННАЯ НАГРУЗКА ═══════ */}

            {/* 10. Распределение по дням недели */}
            {useServiceRequest && !loading && !error && weekdayDistribution.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Загрузка по дням недели
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                        Количество приёмок и платный вес в разрезе дня недели
                    </Typography.Body>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-end', height: 100, marginBottom: '0.4rem' }}>
                        {weekdayDistribution.map((d, idx) => {
                            const colH = d.count === 0 ? 0 : Math.max(d.percent, 4);
                            return (
                            <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                                <motion.div
                                    style={{ width: '100%', maxWidth: 38, display: 'flex', flexDirection: 'column', borderRadius: '5px 5px 0 0', overflow: 'hidden' }}
                                    initial={chartBarFillEnabled ? { height: '0%' } : false}
                                    animate={{ height: `${colH}%` }}
                                    transition={chartBarFillEnabled ? { duration: CHART_BAR_FILL_DURATION, ease: CHART_BAR_FILL_EASE, delay: idx * 0.05 } : { duration: 0 }}
                                >
                                    {d.ferry > 0 && <div style={{ flex: d.ferry, background: '#3b82f6' }} title={`Паром: ${d.ferry}`} />}
                                    {d.auto > 0 && <div style={{ flex: d.auto, background: '#f59e0b' }} title={`Авто: ${d.auto}`} />}
                                    {d.count === 0 && <div style={{ flex: 1, background: 'var(--color-bg-hover)' }} />}
                                </motion.div>
                            </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        {weekdayDistribution.map((d) => (
                            <div key={`lbl-${d.label}`} style={{ flex: 1, textAlign: 'center' }}>
                                <Typography.Body style={{ fontSize: '0.72rem', color: d.label === 'Сб' || d.label === 'Вс' ? '#ef4444' : 'var(--color-text-secondary)', fontWeight: 600, display: 'block', lineHeight: '1.2' }}>{d.label}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', display: 'block', lineHeight: '1.2', marginTop: '0.1rem' }}>{d.count} шт</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', display: 'block', lineHeight: '1.2', marginTop: '0.05rem' }}>{Math.round(d.pw).toLocaleString('ru-RU')} кг</Typography.Body>
                            </div>
                        ))}
                    </div>
                    <Flex gap="0.75rem">
                        <Flex align="center" gap="0.25rem"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} /><Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Паром</Typography.Body></Flex>
                        <Flex align="center" gap="0.25rem"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Авто</Typography.Body></Flex>
                    </Flex>
                </Panel>
            )}

            {/* 6. Календарь загрузки (heatmap) */}
            {useServiceRequest && !loading && !error && loadHeatmap.cells.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Flex align="center" justify="space-between" style={{ marginBottom: '0.15rem' }}>
                        <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600 }}>
                            Календарь загрузки
                        </Typography.Headline>
                        <Flex align="center" gap="0.4rem">
                            {(() => {
                                const canPrev = heatmapMonth.year > heatmapRange.minYear || (heatmapMonth.year === heatmapRange.minYear && heatmapMonth.month > heatmapRange.minMonth);
                                const canNext = heatmapMonth.year < heatmapRange.maxYear || (heatmapMonth.year === heatmapRange.maxYear && heatmapMonth.month < heatmapRange.maxMonth);
                                return (
                                    <>
                                        <Button className="filter-button" style={{ padding: '0.25rem 0.45rem', fontSize: '0.8rem', opacity: canPrev ? 1 : 0.3 }} disabled={!canPrev} onClick={() => canPrev && setHeatmapMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))}>←</Button>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.82rem', minWidth: '8rem', textAlign: 'center' }}>
                                            {['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][loadHeatmap.month - 1]} {loadHeatmap.year}
                                        </Typography.Body>
                                        <Button className="filter-button" style={{ padding: '0.25rem 0.45rem', fontSize: '0.8rem', opacity: canNext ? 1 : 0.3 }} disabled={!canNext} onClick={() => canNext && setHeatmapMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))}>→</Button>
                                    </>
                                );
                    })()}
                        </Flex>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>
                        Интенсивность приёмок по дням месяца. Чем ярче ячейка — тем больше грузов принято в этот день.
                    </Typography.Body>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((wd) => (
                            <div key={`hm-h-${wd}`} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontWeight: 600, padding: '0.15rem' }}>{wd}</div>
                        ))}
                        {(() => {
                            const first = new Date(loadHeatmap.year, loadHeatmap.month - 1, 1);
                            const offset = (first.getDay() + 6) % 7;
                            const blanks = Array.from({ length: offset }, (_, i) => (
                                <div key={`hm-blank-${i}`} />
                            ));
                            const days = loadHeatmap.cells.map((cell) => {
                                const intensity = cell.count / loadHeatmap.maxCount;
                                return (
                                    <div key={`hm-${cell.key}`} title={`${cell.key}: ${cell.count} грузов, ${Math.round(cell.pw)} кг`} style={{ textAlign: 'center', borderRadius: 5, padding: '0.3rem 0.15rem', fontSize: '0.72rem', fontWeight: cell.count > 0 ? 600 : 400, background: cell.count > 0 ? `rgba(37,99,235,${0.12 + intensity * 0.55})` : 'var(--color-bg-hover)', color: intensity > 0.5 ? 'white' : 'var(--color-text-primary)', cursor: 'default' }}>
                                        {cell.day}
                                        {cell.count > 0 && <div style={{ fontSize: '0.6rem', fontWeight: 400, opacity: 0.85 }}>{cell.count}</div>}
                                    </div>
                                );
                            });
                            return [...blanks, ...days];
                        })()}
                    </div>
                </Panel>
            )}

            {/* 1. Воронка статусов */}
            {useServiceRequest && !loading && !error && statusFunnel.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>
                        Воронка статусов
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.45rem' }}>
                        Распределение грузов по этапам обработки: от приёмки до доставки получателю.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {(() => {
                            const maxC = Math.max(...statusFunnel.map((s) => s.count), 1);
                            const totalC = statusFunnel.reduce((a, s) => a + s.count, 0) || 1;
                            return statusFunnel.map((stage, fi) => {
                                const isActive = selectedFunnelStatusKey === stage.key;
                                return (
                                    <button
                                        key={stage.key}
                                        type="button"
                                        onClick={() => { setSelectedFunnelStatusKey((prev) => (prev === stage.key ? null : stage.key)); setExpandedFunnelCustomer(null); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isActive ? 'var(--color-bg-hover)' : 'transparent', border: isActive ? '1px solid var(--color-border)' : '1px solid transparent', borderRadius: 8, padding: '0.2rem 0.25rem', cursor: 'pointer', textAlign: 'left' }}
                                        title="Показать список заказчиков по статусу"
                                    >
                                        <Typography.Body style={{ fontSize: '0.78rem', width: 110, flexShrink: 0, color: 'var(--color-text-secondary)' }}>{stage.label}</Typography.Body>
                                        <div style={{ flex: 1, height: 14, borderRadius: 7, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={Math.round((stage.count / maxC) * 100)} delay={fi * 0.04} style={{ background: stage.color, borderRadius: 7 }} />
                                        </div>
                                        <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: 44, textAlign: 'right' }}>{stage.count}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', minWidth: 36, textAlign: 'right' }}>{Math.round((stage.count / totalC) * 100)}%</Typography.Body>
                                    </button>
                                );
                            });
                        })()}
                    </div>
                    {selectedFunnelStatusKey && (
                        <div style={{ marginTop: '0.55rem', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.55rem', background: 'var(--color-bg-hover)' }}>
                            <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                                Заказчики по статусу: {statusFunnel.find((s) => s.key === selectedFunnelStatusKey)?.label || selectedFunnelStatusKey}. Нажмите на заказчика — перевозки и даты.
                            </Typography.Body>
                            <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'left', fontWeight: 600, width: 24 }}>#</th>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'left', fontWeight: 600 }}>Заказчик</th>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600 }}>Кол-во</th>
                                            {showSums && <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>Сумма</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(statusFunnelCustomersTable[selectedFunnelStatusKey] ?? []).map((row, idx) => {
                                            const isExpanded = expandedFunnelCustomer === row.customer;
                                            const items = (statusFunnelItemsByCustomer[selectedFunnelStatusKey] ?? {})[row.customer] ?? [];
                                            const sortedItems = [...items].sort((a, b) => {
                                                const da = dateUtils.parseDateOnly(String(a?.DatePrih ?? a?.DateOtpr ?? ''))?.getTime() ?? 0;
                                                const db = dateUtils.parseDateOnly(String(b?.DatePrih ?? b?.DateOtpr ?? ''))?.getTime() ?? 0;
                                                return db - da;
                                            });
                                            return (
                                                <React.Fragment key={row.customer}>
                                                    <tr
                                                        onClick={() => setExpandedFunnelCustomer(isExpanded ? null : row.customer)}
                                                        style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: isExpanded ? 'var(--color-bg-card)' : undefined }}
                                                        title="Нажмите, чтобы показать перевозки"
                                                    >
                                                        <td style={{ padding: '0.35rem 0.45rem', color: 'var(--color-text-secondary)' }}>{idx + 1}</td>
                                                        <td style={{ padding: '0.35rem 0.45rem' }}>{row.customer}{isExpanded ? ' ▼' : ' ▶'}</td>
                                                        <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}>{row.count}</td>
                                                        {showSums && <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum)}</td>}
                                                    </tr>
                                                    {isExpanded && sortedItems.length > 0 && (
                                                        <tr>
                                                            <td colSpan={showSums ? 4 : 3} style={{ padding: '0.35rem 0.45rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)', verticalAlign: 'top' }}>
                                                                <div style={{ fontSize: '0.72rem', paddingLeft: '0.5rem' }}>
                                                                    <Typography.Body style={{ fontSize: '0.68rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--color-text-secondary)' }}>Перевозки и даты</Typography.Body>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                                                                        <thead>
                                                                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                                <th style={{ padding: '0.2rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Перевозка</th>
                                                                                <th style={{ padding: '0.2rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                                                                                {showSums && <th style={{ padding: '0.2rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {sortedItems.map((it, i) => (
                                                                                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                                                                                    <td style={{ padding: '0.2rem 0.3rem' }}>{String(it?.Number ?? it?.Номер ?? '—').trim() || '—'}</td>
                                                                                    <td style={{ padding: '0.2rem 0.3rem' }}>
                                                                                        <DateText value={String(it?.DatePrih ?? it?.DateOtpr ?? it?.Дата ?? '').trim()} />
                                                                                    </td>
                                                                                    {showSums && <td style={{ padding: '0.2rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{it?.Sum != null ? formatCurrency(it.Sum as number, true) : '—'}</td>}
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </Panel>
            )}

            {/* ═══════ ГРУППА 3: ЛОГИСТИКА И СРОКИ ═══════ */}

            {!showOnlySla && !loading && !error && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Грузовой поток (по плановой дате)
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        Поток перевозок по плановой дате доставки: нагрузка на ближайшие дни и риск просрочки.
                    </Typography.Body>
                    <Flex gap="0.6rem" wrap="wrap" style={{ marginBottom: '0.9rem' }}>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(37,99,235,0.14)', border: '1px solid rgba(37,99,235,0.35)' }}>С планом: {cargoFlowByPlan.withPlan} из {cargoFlowByPlan.total}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: cargoFlowByPlan.overdue > 0 ? 'rgba(239,68,68,0.16)' : 'rgba(148,163,184,0.16)', border: cargoFlowByPlan.overdue > 0 ? '1px solid rgba(239,68,68,0.35)' : '1px solid var(--color-border)' }}>Просрочено: {cargoFlowByPlan.overdue}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.35)' }}>Сегодня: {cargoFlowByPlan.dueToday}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.35)' }}>Завтра: {cargoFlowByPlan.dueTomorrow}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.35)' }}>2-7 дней: {cargoFlowByPlan.dueNext7}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(148,163,184,0.16)', border: '1px solid var(--color-border)' }}>Без плановой: {cargoFlowByPlan.withoutPlan}</span>
                    </Flex>
                    <div style={{ marginTop: '0.4rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.45rem' }}>
                            Ближайшие 7 дней (плановая доставка)
                        </Typography.Body>
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))', gap: '0.45rem', minWidth: '56rem' }}>
                            {cargoFlowByPlan.upcomingSeries.map((row) => {
                                return (
                                    <div
                                        key={`cargo-flow-${row.key}`}
                                        style={{
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 10,
                                            padding: '0.45rem 0.5rem',
                                            background: row.count > 0 ? 'rgba(37,99,235,0.05)' : 'var(--color-bg-hover)',
                                            minHeight: '9.1rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.3rem',
                                        }}
                                    >
                                        <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600 }}>
                                            <DateText value={row.key} />
                                        </Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                                            Всего: {row.count}
                                        </Typography.Body>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.22rem', marginTop: '0.08rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                                                <Flex align="center" gap="0.25rem">
                                                    <Ship className="w-3.5 h-3.5" style={{ color: '#2563eb' }} />
                                                    <Typography.Body style={{ fontSize: '0.72rem' }}>Паром</Typography.Body>
                                                </Flex>
                                                <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600 }}>{row.ferry.count}</Typography.Body>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                                                <Flex align="center" gap="0.25rem">
                                                    <Truck className="w-3.5 h-3.5" style={{ color: '#16a34a' }} />
                                                    <Typography.Body style={{ fontSize: '0.72rem' }}>Авто</Typography.Body>
                                                </Flex>
                                                <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600 }}>{row.auto.count}</Typography.Body>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '0.1rem', paddingTop: '0.3rem', borderTop: '1px dashed var(--color-border)' }}>
                                            <Typography.Body style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                                                Мест: {Math.round(row.mest).toLocaleString('ru-RU')}
                                            </Typography.Body>
                                            <Typography.Body style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                                                Вес: {Math.round(row.pw).toLocaleString('ru-RU')} кг
                                            </Typography.Body>
                                            <Typography.Body style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                                                Объём: {row.vol.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} м³
                                            </Typography.Body>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        </div>
                    </div>
                    {(cargoFlowByPlan.deliveredOnTime + cargoFlowByPlan.deliveredLate) > 0 && (
                        <Typography.Body style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            Доставлено: в срок {cargoFlowByPlan.deliveredOnTime}, с опозданием {cargoFlowByPlan.deliveredLate}.
                        </Typography.Body>
                    )}
                </Panel>
            )}

            {!showOnlySla && !loading && !error && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        План-Факт
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        Сравнение плановой и фактической даты доставки по выбранному периоду.
                    </Typography.Body>
                    <Flex gap="0.55rem" wrap="wrap" style={{ marginBottom: '0.8rem' }}>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(37,99,235,0.14)', border: '1px solid rgba(37,99,235,0.35)' }}>С планом: {planVsFactDashboard.withPlan} из {planVsFactDashboard.total}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(22,163,74,0.16)', border: '1px solid rgba(22,163,74,0.35)' }}>В срок: {planVsFactDashboard.onTime}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.35)' }}>С опозданием: {planVsFactDashboard.late}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.35)' }}>Без факта: {planVsFactDashboard.pendingFact}</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.35)' }}>В срок, %: {planVsFactDashboard.onTimeRate}%</span>
                        <span className="role-badge" style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(148,163,184,0.16)', border: '1px solid var(--color-border)' }}>Без плана: {planVsFactDashboard.withoutPlan}</span>
                    </Flex>
                    <Flex gap="1.4rem" wrap="wrap" style={{ marginBottom: '0.7rem' }}>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                            Ср. отклонение (план→факт): <b style={{ color: 'var(--color-text-primary)' }}>{planVsFactDashboard.avgDeviationDays} дн.</b>
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                            Ср. задержка (только просрочка): <b style={{ color: '#ef4444' }}>{planVsFactDashboard.avgLateDays} дн.</b>
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                            Просрочено без факта: <b style={{ color: planVsFactDashboard.overdueOpen > 0 ? '#ef4444' : 'var(--color-text-primary)' }}>{planVsFactDashboard.overdueOpen}</b>
                        </Typography.Body>
                    </Flex>
                    {planVsFactDashboard.trend.length > 0 && (
                        <div style={{ marginTop: '0.35rem' }}>
                            <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                                Тренд по датам плана (последние 10 дней)
                            </Typography.Body>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${planVsFactDashboard.trend.length}, minmax(86px, 1fr))`, gap: '0.4rem', minWidth: `${Math.max(560, planVsFactDashboard.trend.length * 92)}px` }}>
                                    {planVsFactDashboard.trend.map((row, ti) => (
                                        <div key={`pvf-${row.key}`} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.38rem 0.42rem', background: 'var(--color-bg-hover)' }}>
                                            <Typography.Body style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginBottom: '0.18rem' }}>
                                                <DateText value={row.key} />
                                            </Typography.Body>
                                            <div style={{ height: 7, borderRadius: 4, background: 'rgba(148,163,184,0.25)', overflow: 'hidden', marginBottom: '0.2rem' }}>
                                                <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={Math.round((row.total / planVsFactDashboard.maxTotal) * 100)} delay={ti * 0.035} style={{ background: 'rgba(99,102,241,0.7)', borderRadius: 4 }} />
                                            </div>
                                            <Typography.Body style={{ fontSize: '0.68rem', display: 'block' }}>Всего: {row.total}</Typography.Body>
                                            <Typography.Body style={{ fontSize: '0.68rem', color: '#16a34a', display: 'block' }}>В срок: {row.onTime}</Typography.Body>
                                            <Typography.Body style={{ fontSize: '0.68rem', color: '#ef4444', display: 'block' }}>Опоздание: {row.late}</Typography.Body>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {planVsFactDashboard.topLate.length > 0 && (
                        <div style={{ marginTop: '0.8rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.55rem' }}>
                            <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                                Топ просрочек
                            </Typography.Body>
                            {planVsFactDashboard.topLate.map((row, idx) => (
                                <div key={`late-row-${row.number}-${idx}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 110px) minmax(120px, 1fr) minmax(64px, 90px) minmax(64px, 90px) minmax(56px, 70px)', gap: '0.45rem', padding: '0.22rem 0', borderBottom: idx === planVsFactDashboard.topLate.length - 1 ? 'none' : '1px dashed var(--color-border)' }}>
                                    <Typography.Body style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{formatInvoiceNumber(row.number)}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.route}>{row.route}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>{row.planned.slice(5).split('-').reverse().join('.')}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>{row.actual.slice(5).split('-').reverse().join('.')}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ef4444' }}>+{row.delayDays} д</Typography.Body>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            )}

            </DashboardMotionItem>
            <DashboardMotionItem enabled={dashboardMotionEnabled}>
            {/* === ВИДЖЕТ 4: Монитор SLA (включить: WIDGET_4_SLA = true); в режиме "только SLA" показываем даже при 0 перевозок === */}
            {WIDGET_4_SLA && !loading && !error && (slaStats.total > 0 || showOnlySla) && (
                <Panel className="cargo-card sla-monitor-panel" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.5rem' }}>
                    <Flex align="center" justify="space-between" className="sla-monitor-header" style={{ marginBottom: '0.2rem' }}>
                        <Typography.Headline style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                            монитор срока доставки
                        </Typography.Headline>
                        {slaStats.total > 0 && slaTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} title="Динамика SLA улучшается" />}
                        {slaStats.total > 0 && slaTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} title="Динамика SLA ухудшается" />}
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                        Контроль сроков доставки: % выполнения SLA, средний срок и детали по перевозкам вне норматива.
                    </Typography.Body>
                    {slaStats.total === 0 ? (
                        <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Нет перевозок за выбранный период.</Typography.Body>
                    ) : (
                    <>
                    <Flex gap="2rem" wrap="wrap" align="flex-start" className="sla-monitor-metrics" style={{ marginBottom: '1rem' }}>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>В срок{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: slaStats.percentOnTime >= 90 ? 'var(--color-success-status)' : slaStats.percentOnTime >= 70 ? '#f59e0b' : '#ef4444', display: 'inline' }}>
                                {slaStats.percentOnTime}%
                            </Typography.Body>
                            <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'inline' }}>{'   '}{slaStats.onTime} из {slaStats.total} перевозок</Typography.Body>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Средняя просрочка{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: slaStats.avgDelay > 0 ? '#ef4444' : 'var(--color-text-primary)', display: 'inline' }}>
                                {slaStats.avgDelay} дн.
                            </Typography.Body>
                        </div>
                        {useServiceRequest && (
                            <>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Мин. дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.minDays} дн.
                                    </Typography.Body>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Макс. дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.maxDays} дн.
                                    </Typography.Body>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Среднее дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.avgDays} дн.
                                    </Typography.Body>
                                </div>
                            </>
                        )}
                    </Flex>
                    <div
                        className="sla-monitor-details-toggle"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSlaDetailsOpen(!slaDetailsOpen)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSlaDetailsOpen(!slaDetailsOpen); } }}
                        style={{ cursor: 'pointer', marginBottom: slaDetailsOpen ? '0.75rem' : 0 }}
                        title={slaDetailsOpen ? 'Свернуть' : 'Подробности по типу перевозки'}
                    >
                        <div style={{ height: 12, borderRadius: 6, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                            <DashboardChartBarH
                                enabled={chartBarFillEnabled}
                                widthPercent={slaStats.percentOnTime}
                                delay={0.08}
                                style={{
                                    borderRadius: 6,
                                    background: `linear-gradient(90deg, var(--color-success-status) 0%, #f59e0b 50%, #ef4444 100%)`,
                                }}
                            />
                        </div>
                        <Typography.Body style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                            {slaDetailsOpen ? '▼ Подробности' : '▶ Нажмите для разбивки по типу перевозки'}
                        </Typography.Body>
                    </div>
                    {slaDetailsOpen && (
                        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Авто{'   '}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                                    {slaStatsByType.auto.percentOnTime}% ({slaStatsByType.auto.onTime}/{slaStatsByType.auto.total}), ср. {slaStatsByType.auto.avgDelay} дн.
                                </Typography.Body>
                                {outOfSlaByType.auto.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                        <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('number'); }} title="Сортировка">Номер{slaTableSortColumn === 'number' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('date'); }} title="Сортировка">Дата прихода{slaTableSortColumn === 'date' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('status'); }} title="Сортировка">Статус{slaTableSortColumn === 'status' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('mest'); }} title="Сортировка">Мест{slaTableSortColumn === 'mest' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('pw'); }} title="Сортировка">Плат. вес{slaTableSortColumn === 'pw' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('sum'); }} title="Сортировка">Сумма{slaTableSortColumn === 'sum' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('days'); }} title="Сортировка">Дней{slaTableSortColumn === 'days' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('plan'); }} title="Сортировка">План{slaTableSortColumn === 'plan' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('delay'); }} title="Сортировка">Просрочка{slaTableSortColumn === 'delay' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedOutOfSlaAuto.map(({ item, sla }, idx) => (
                                                    <React.Fragment key={`auto-${item.Number ?? idx}`}>
                                                        <tr
                                                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedSlaCargoNumber === (item.Number ?? '') ? 'var(--color-bg-hover)' : undefined }}
                                                            onClick={() => {
                                                                const num = item.Number ?? '';
                                                                if (expandedSlaCargoNumber === num) {
                                                                    setExpandedSlaCargoNumber(null);
                                                                    setExpandedSlaItem(null);
                                                                } else {
                                                                    setExpandedSlaCargoNumber(num);
                                                                    setExpandedSlaItem(item);
                                                                }
                                                            }}
                                                            title={expandedSlaCargoNumber === (item.Number ?? '') ? 'Свернуть статусы' : 'Показать статусы перевозки'}
                                                        >
                                                            <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>{item.Number ?? '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                            <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                                        </tr>
                                                        {expandedSlaCargoNumber === (item.Number ?? '') && (
                                                            <tr>
                                                                <td colSpan={10} style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                                    <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>Статусы перевозки</Typography.Body>
                                                                    {slaTimelineLoading && (
                                                                        <Flex align="center" gap="0.5rem" style={{ padding: '0.35rem 0' }}>
                                                                            <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                                                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Загрузка…</Typography.Body>
                                                                        </Flex>
                                                                    )}
                                                                    {slaTimelineError && (
                                                                        <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{slaTimelineError}</Typography.Body>
                                                                    )}
                                                                    {!slaTimelineLoading && slaTimelineSteps && slaTimelineSteps.length > 0 && (() => {
                                                                        const planEndMs = item?.DatePrih ? new Date(item.DatePrih).getTime() + getPlanDays(item) * 24 * 60 * 60 * 1000 : 0;
                                                                        return (
                                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                            <thead>
                                                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата доставки</th>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Время доставки</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {slaTimelineSteps.map((step, i) => {
                                                                                    const stepMs = step.date ? new Date(step.date).getTime() : 0;
                                                                                    const outOfSlaFromThisStep = planEndMs > 0 && stepMs > planEndMs;
                                                                                    const dateColor = outOfSlaFromThisStep ? '#ef4444' : (planEndMs > 0 && stepMs > 0 ? '#22c55e' : 'var(--color-text-secondary)');
                                                                                    return (
                                                                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', color: outOfSlaFromThisStep ? '#ef4444' : undefined }}>{step.label}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', color: dateColor }}>{formatTimelineDate(step.date)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', color: dateColor }}>{formatTimelineTime(step.date)}</td>
                                                                                    </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                        );
                                                                    })()}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Паром{'   '}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                                    {slaStatsByType.ferry.percentOnTime}% ({slaStatsByType.ferry.onTime}/{slaStatsByType.ferry.total}), ср. {slaStatsByType.ferry.avgDelay} дн.
                                </Typography.Body>
                                {outOfSlaByType.ferry.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                        <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('number'); }} title="Сортировка">Номер{slaTableSortColumn === 'number' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('date'); }} title="Сортировка">Дата прихода{slaTableSortColumn === 'date' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('status'); }} title="Сортировка">Статус{slaTableSortColumn === 'status' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('mest'); }} title="Сортировка">Мест{slaTableSortColumn === 'mest' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('pw'); }} title="Сортировка">Плат. вес{slaTableSortColumn === 'pw' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('sum'); }} title="Сортировка">Сумма{slaTableSortColumn === 'sum' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('days'); }} title="Сортировка">Дней{slaTableSortColumn === 'days' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('plan'); }} title="Сортировка">План{slaTableSortColumn === 'plan' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('delay'); }} title="Сортировка">Просрочка{slaTableSortColumn === 'delay' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedOutOfSlaFerry.map(({ item, sla }, idx) => (
                                                    <tr key={`ferry-${item.Number ?? idx}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>{item.Number ?? '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    </>
                    )}
                </Panel>
            )}

            </DashboardMotionItem>
            <DashboardMotionItem enabled={dashboardMotionEnabled}>
            {/* ═══════ ГРУППА 4: ФИНАНСЫ И КЛИЕНТЫ ═══════ */}

            {/* === ВИДЖЕТ 5: Платёжный календарь (включить: WIDGET_5_PAYMENT_CALENDAR = true) === */}
            {WIDGET_5_PAYMENT_CALENDAR && showPaymentCalendar && !loading && !error && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Платёжный календарь</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        Рекомендуемые дни оплаты выставленных и неоплаченных счетов
                    </Typography.Body>
                    {paymentCalendarLoading ? (
                        <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка условий оплаты...</Typography.Body></Flex>
                    ) : (
                        <>
                            <Flex align="center" gap="0.5rem" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem' }} onClick={() => setPaymentCalendarMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))}>←</Button>
                                <Typography.Body style={{ fontWeight: 600, minWidth: '10rem', textAlign: 'center' }}>
                                    {['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][paymentCalendarMonth.month - 1]} {paymentCalendarMonth.year}
                                </Typography.Body>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem' }} onClick={() => setPaymentCalendarMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))}>→</Button>
                                <Button
                                    type="button"
                                    className="filter-button"
                                    style={{ padding: '0.35rem 0.55rem' }}
                                    title="Текущий месяц"
                                    onClick={() => {
                                        const n = new Date();
                                        setPaymentCalendarMonth({ year: n.getFullYear(), month: n.getMonth() + 1 });
                                    }}
                                >
                                    Сегодня
                                </Button>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem', marginLeft: '0.25rem' }} onClick={() => mutateCalendarInvoices()} title="Обновить счета с начала текущего года" aria-label="Обновить счета">
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </Flex>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0.5rem' }}>
                                <div className="payment-calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(2.5rem, 1fr))', gap: '2px', fontSize: '0.75rem', minWidth: '22rem' }}>
                                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'За неделю'].map((wd) => (
                                        <div key={wd} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600, padding: '0.25rem' }}>{wd}</div>
                                    ))}
                                    {(() => {
                                        const { year, month } = paymentCalendarMonth;
                                        const first = new Date(year, month - 1, 1);
                                        const lastDay = new Date(year, month, 0).getDate();
                                        const startOffset = (first.getDay() + 6) % 7;
                                        const cells: { day: number | null; key: string | null; dow: number }[] = [];
                                        for (let i = 0; i < startOffset; i++) cells.push({ day: null, key: null, dow: i });
                                        for (let d = 1; d <= lastDay; d++) {
                                            const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                            const date = new Date(year, month - 1, d);
                                            const dow = (date.getDay() + 6) % 7;
                                            cells.push({ day: d, key, dow });
                                        }
                                        const weeks: { cells: typeof cells }[] = [];
                                        for (let i = 0; i < cells.length; i += 7) {
                                            const chunk = cells.slice(i, i + 7);
                                            while (chunk.length < 7) chunk.push({ day: null, key: null, dow: chunk.length });
                                            weeks.push({ cells: chunk });
                                        }
                                        return weeks.flatMap(({ cells: weekCells }, wi) => {
                                            let weekSum = 0;
                                            for (let i = 0; i < 7; i++) {
                                                const c = weekCells[i];
                                                if (c?.key) {
                                                    const e = plannedByDate.get(c.key);
                                                    if (e?.total) weekSum += e.total;
                                                }
                                            }
                                            const monFri = weekCells.slice(0, 5);
                                            const row: React.ReactNode[] = monFri.map((c, i) => {
                                                const entry = c.key ? plannedByDate.get(c.key) : undefined;
                                                const sum = entry?.total;
                                                const hasSum = sum != null && sum > 0;
                                                return (
                                                    <div
                                                        key={`w${wi}-${i}-${c.key ?? ''}`}
                                                        className="payment-calendar-day-cell"
                                                        role={hasSum ? 'button' : undefined}
                                                        tabIndex={hasSum ? 0 : undefined}
                                                        onClick={hasSum && c.key ? () => setPaymentCalendarSelectedDate(c.key) : undefined}
                                                        onKeyDown={hasSum && c.key ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPaymentCalendarSelectedDate(c.key); } } : undefined}
                                                        style={{
                                                            padding: '0.35rem',
                                                            textAlign: 'center',
                                                            borderRadius: 4,
                                                            background: hasSum ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                                            color: hasSum ? 'white' : 'var(--color-text-secondary)',
                                                            minHeight: '2.25rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: hasSum ? 'pointer' : undefined,
                                                        }}
                                                        title={c.key && hasSum ? `${c.key}: ${Math.round(sum!).toLocaleString('ru-RU')} ₽` : undefined}
                                                    >
                                                        {c.day != null ? c.day : ''}
                                                        {hasSum && <span className="payment-calendar-day-amount" style={{ fontSize: '0.65rem', lineHeight: 1 }}>{formatCurrency(sum!, true)}</span>}
                                                    </div>
                                                );
                                            });
                                            row.push(
                                                <div
                                                    key={`week-${wi}`}
                                                    className="payment-calendar-week-total"
                                                    style={{
                                                        padding: '0.35rem',
                                                        textAlign: 'center',
                                                        borderRadius: 4,
                                                        background: weekSum > 0 ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                                        color: weekSum > 0 ? 'white' : 'var(--color-text-secondary)',
                                                        minHeight: '2.25rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: weekSum > 0 ? 600 : undefined,
                                                    }}
                                                >
                                                    {weekSum > 0 ? formatCurrency(weekSum, true) : '—'}
                                                </div>
                                            );
                                            return row;
                                        });
                                    })()}
                                </div>
                            </div>
                            {paymentCalendarSelectedDate && plannedByDate.get(paymentCalendarSelectedDate) && (
                                <div className="modal-overlay" style={{ zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="payment-calendar-day-title" onClick={() => setPaymentCalendarSelectedDate(null)}>
                                    <div className="modal-content" style={{ maxWidth: '22rem', padding: '1rem', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                                        <Typography.Body id="payment-calendar-day-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                                            Плановое поступление — {paymentCalendarSelectedDate}
                                        </Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                                            Заказчики и суммы:
                                        </Typography.Body>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            {plannedByDate.get(paymentCalendarSelectedDate)!.items.map((row, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--color-border)' }}>
                                                    <Typography.Body style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.customer}>{row.customer}</Typography.Body>
                                                    <Typography.Body style={{ fontWeight: 600, flexShrink: 0 }}>{formatCurrency(row.sum, true)}</Typography.Body>
                                                </div>
                                            ))}
                                        </div>
                                        <Flex justify="space-between" align="center" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)', fontWeight: 600 }}>
                                            <Typography.Body>Итого:</Typography.Body>
                                            <Typography.Body>{formatCurrency(plannedByDate.get(paymentCalendarSelectedDate)!.total, true)}</Typography.Body>
                                        </Flex>
                                        <Button type="button" className="filter-button" style={{ marginTop: '0.75rem', width: '100%' }} onClick={() => setPaymentCalendarSelectedDate(null)}>Закрыть</Button>
                                    </div>
                                </div>
                            )}
                            {plannedByDate.size === 0 && !paymentCalendarLoading && (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                                    Нет данных за выбранный период или условия оплаты не заданы в справочнике.
                                </Typography.Body>
                            )}
                        </>
                    )}
                </Panel>
            )}

            {/* 4. Старение дебиторки */}
            {useServiceRequest && !loading && !error && invoiceAging.total > 0 && showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Старение дебиторки
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                        Неоплаченные счета по давности выставления
                    </Typography.Body>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        {invoiceAging.buckets.map((b) => (
                            <div
                                key={b.label}
                                onClick={() => b.count > 0 && setExpandedAgingBucket(expandedAgingBucket === b.label ? null : b.label)}
                                style={{
                                    border: `1px solid ${expandedAgingBucket === b.label ? b.color : b.color + '33'}`,
                                    borderRadius: 10,
                                    padding: '0.55rem',
                                    background: expandedAgingBucket === b.label ? `${b.color}18` : `${b.color}0a`,
                                    cursor: b.count > 0 ? 'pointer' : 'default',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem', display: 'block' }}>{b.label}</Typography.Body>
                                <Typography.Body style={{ fontWeight: 700, fontSize: '1rem', color: b.color, display: 'block', marginBottom: '0.15rem' }}>{b.count}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600, display: 'block' }}>{formatCurrency(b.sum, true)}</Typography.Body>
                            </div>
                        ))}
                    </div>
                    <div style={{ height: 10, borderRadius: 5, background: 'var(--color-bg-hover)', overflow: 'hidden', display: 'flex' }}>
                        {invoiceAging.buckets.map((b, bi) => (
                            <DashboardChartBarH
                                key={`aging-bar-${b.label}`}
                                enabled={chartBarFillEnabled}
                                widthPercent={invoiceAging.total > 0 ? (b.sum / invoiceAging.total) * 100 : 0}
                                delay={bi * 0.06}
                                style={{ background: b.color }}
                                title={`${b.label}: ${formatCurrency(b.sum, true)}`}
                            />
                        ))}
                    </div>
                    {expandedAgingBucket && (() => {
                        const bucket = invoiceAging.buckets.find((b) => b.label === expandedAgingBucket);
                        if (!bucket || bucket.items.length === 0) return null;
                        const sorted = [...bucket.items].sort((a, b2) => {
                            let cmp = 0;
                            if (agingSortCol === 'number') cmp = a.number.localeCompare(b2.number);
                            else if (agingSortCol === 'customer') cmp = a.customer.localeCompare(b2.customer);
                            else if (agingSortCol === 'status') cmp = a.status.localeCompare(b2.status);
                            else if (agingSortCol === 'shipmentStatus') cmp = a.shipmentStatus.localeCompare(b2.shipmentStatus);
                            else if (agingSortCol === 'sum') cmp = a.sum - b2.sum;
                            else cmp = a.days - b2.days;
                            return agingSortAsc ? cmp : -cmp;
                        });
                        const toggleSort = (col: typeof agingSortCol) => {
                            if (agingSortCol === col) setAgingSortAsc(!agingSortAsc);
                            else { setAgingSortCol(col); setAgingSortAsc(col === 'number' || col === 'customer' || col === 'status' || col === 'shipmentStatus'); }
                        };
                        const arrow = (col: typeof agingSortCol) => agingSortCol === col ? (agingSortAsc ? ' ↑' : ' ↓') : '';
                        const thStyle = (align: string): React.CSSProperties => ({ padding: '0.35rem 0.5rem', textAlign: align as any, fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' });
                        const shipmentColor = (s: string) => {
                            if (!s || s === '—') return '#94a3b8';
                            const l = s.toLowerCase();
                            if (l.includes('доставлен') || l.includes('заверш')) return '#10b981';
                            if (l.includes('доставке')) return '#f59e0b';
                            if (l.includes('готов')) return '#8b5cf6';
                            if (l.includes('пути') || l.includes('отправлен')) return '#3b82f6';
                            return '#94a3b8';
                        };
                        const routeColor = (r: string) => {
                            if (r === 'MSK-KGD') return '#2563eb';
                            if (r === 'KGD-MSK') return '#7c3aed';
                            return '#64748b';
                        };
                        return (
                            <div style={{ marginTop: '0.6rem' }}>
                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: bucket.color }}>
                                    {bucket.label} — {bucket.count} {bucket.count === 1 ? 'счёт' : bucket.count < 5 ? 'счёта' : 'счетов'}
                                </Typography.Body>
                                <div style={{ maxHeight: 280, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--color-bg-hover)', position: 'sticky', top: 0 }}>
                                                <th style={thStyle('left')} onClick={() => toggleSort('number')}>Счёт{arrow('number')}</th>
                                                <th style={thStyle('left')} onClick={() => toggleSort('customer')}>Заказчик{arrow('customer')}</th>
                                                <th style={thStyle('center')} onClick={() => toggleSort('status')}>Статус{arrow('status')}</th>
                                                <th style={thStyle('center')} onClick={() => toggleSort('shipmentStatus')}>Статус перевозки{arrow('shipmentStatus')}</th>
                                                <th style={{ ...thStyle('center'), cursor: 'default' }}>Маршрут</th>
                                                <th style={thStyle('right')} onClick={() => toggleSort('sum')}>Сумма{arrow('sum')}</th>
                                                <th style={thStyle('right')} onClick={() => toggleSort('days')}>Дней{arrow('days')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sorted.map((inv, idx) => {
                                                const st = inv.status || '—';
                                                const stColor = /оплач/i.test(st) ? '#10b981' : /частич/i.test(st) ? '#f59e0b' : /просроч/i.test(st) ? '#ef4444' : /выставлен|ожида/i.test(st) ? '#3b82f6' : '#94a3b8';
                                                const shipSt = inv.shipmentStatus || '—';
                                                const shipStColor = shipmentColor(shipSt);
                                                const route = inv.route || '—';
                                                const routeBadgeColor = routeColor(route);
                                                return (
                                                <tr key={`aging-inv-${idx}`} style={{ borderTop: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '0.3rem 0.5rem', whiteSpace: 'nowrap' }}>{inv.number}</td>
                                                    <td style={{ padding: '0.3rem 0.5rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.customer}</td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.4rem', borderRadius: 999, background: `${stColor}18`, color: stColor, border: `1px solid ${stColor}44`, fontWeight: 600, whiteSpace: 'nowrap' }}>{st}</span>
                                                    </td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.4rem', borderRadius: 999, background: `${shipStColor}18`, color: shipStColor, border: `1px solid ${shipStColor}44`, fontWeight: 600, whiteSpace: 'nowrap' }}>{shipSt}</span>
                                                    </td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.4rem', borderRadius: 999, background: `${routeBadgeColor}18`, color: routeBadgeColor, border: `1px solid ${routeBadgeColor}44`, fontWeight: 600, whiteSpace: 'nowrap' }}>{route}</span>
                                                    </td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(inv.sum, true)}</td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: bucket.color, fontWeight: 600 }}>{inv.days}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}
                </Panel>
            )}

            {/* 3. Pareto / ABC-анализ клиентов */}
            {useServiceRequest && !loading && !error && paretoByCustomer.rows.length > 0 && showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        ABC-анализ клиентов
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                        Концентрация выручки по заказчикам (Парето)
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem', lineHeight: '1.4' }}>
                        % после суммы — кумулятивная доля: сколько от общей выручки дают все клиенты от первого до текущего. A (≤80%) — ключевые, B (≤95%) — средние, C — остальные.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 280, overflowY: 'auto' }}>
                        {paretoByCustomer.rows.slice(0, 15).map((row, i) => {
                            const zone = row.cumPercent <= 80 ? 'A' : row.cumPercent <= 95 ? 'B' : 'C';
                            const zoneColor = zone === 'A' ? '#10b981' : zone === 'B' ? '#f59e0b' : '#94a3b8';
                            return (
                                <div key={`pareto-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: zoneColor, width: 16, textAlign: 'center', flexShrink: 0 }}>{zone}</span>
                                    <Typography.Body style={{ fontSize: '0.76rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>{row.name}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600, flexShrink: 0 }}>{formatCurrency(row.value, true)}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', flexShrink: 0, minWidth: 40, textAlign: 'right' }}>∑{row.cumPercent}%</Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '0.45rem' }}>
                        Всего клиентов: {paretoByCustomer.rows.length} · A (80%): {paretoByCustomer.rows.filter((r) => r.cumPercent <= 80).length} · B (95%): {paretoByCustomer.rows.filter((r) => r.cumPercent > 80 && r.cumPercent <= 95).length} · C: {paretoByCustomer.rows.filter((r) => r.cumPercent > 95).length}
                    </Typography.Body>
                </Panel>
            )}

            {/* 9. Доля повторных клиентов */}
            {useServiceRequest && !loading && !error && repeatCustomers && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Повторные клиенты
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                        Текущий период vs предыдущий — доля возвращающихся заказчиков
                    </Typography.Body>
                    <Flex gap="1rem" wrap="wrap" style={{ marginBottom: '0.5rem' }}>
                        <div style={{ textAlign: 'center' }}>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.5rem', color: '#10b981' }}>{repeatCustomers.repeatPercent}%</Typography.Body>
                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>повторных</Typography.Body>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => setRepeatCustomersListMode((m) => (m === 'all' ? null : 'all'))}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
                                title="Показать список всех заказчиков"
                            >
                                <Typography.Body style={{ fontWeight: 700, fontSize: '1.5rem', textDecoration: repeatCustomersListMode === 'all' ? 'underline' : 'none' }}>{repeatCustomers.total}</Typography.Body>
                            </button>
                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>всего клиентов</Typography.Body>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => setRepeatCustomersListMode((m) => (m === 'repeat' ? null : 'repeat'))}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
                                title="Показать список повторных заказчиков"
                            >
                                <Typography.Body style={{ fontWeight: 700, fontSize: '1.5rem', color: '#3b82f6', textDecoration: repeatCustomersListMode === 'repeat' ? 'underline' : 'none' }}>{repeatCustomers.repeat}</Typography.Body>
                            </button>
                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>повторных</Typography.Body>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => setRepeatCustomersListMode((m) => (m === 'new' ? null : 'new'))}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
                                title="Показать список новых заказчиков"
                            >
                                <Typography.Body style={{ fontWeight: 700, fontSize: '1.5rem', color: '#f59e0b', textDecoration: repeatCustomersListMode === 'new' ? 'underline' : 'none' }}>{repeatCustomers.new}</Typography.Body>
                            </button>
                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>новых</Typography.Body>
                        </div>
                    </Flex>
                    <div style={{ height: 12, borderRadius: 6, background: 'var(--color-bg-hover)', overflow: 'hidden', display: 'flex' }}>
                        <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={repeatCustomers.repeatPercent} delay={0.05} style={{ background: '#10b981', borderRadius: '6px 0 0 6px' }} />
                        <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={100 - repeatCustomers.repeatPercent} delay={0.12} style={{ background: '#f59e0b', borderRadius: '0 6px 6px 0' }} />
                    </div>
                    <Flex gap="0.75rem" style={{ marginTop: '0.3rem' }}>
                        <Flex align="center" gap="0.25rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /><Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>Повторные</Typography.Body></Flex>
                        <Flex align="center" gap="0.25rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>Новые</Typography.Body></Flex>
                    </Flex>
                    {repeatCustomersListMode && (
                        <div style={{ marginTop: '0.6rem', padding: '0.55rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                            <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                                {repeatCustomersListMode === 'all'
                                    ? `Все заказчики (${repeatCustomers.allList.length})`
                                    : repeatCustomersListMode === 'repeat'
                                        ? `Повторные заказчики (${repeatCustomers.repeatList.length})`
                                        : `Новые заказчики (${repeatCustomers.newList.length})`}
                            </Typography.Body>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {(repeatCustomersListMode === 'all'
                                    ? repeatCustomers.allList
                                    : repeatCustomersListMode === 'repeat'
                                        ? repeatCustomers.repeatList
                                        : repeatCustomers.newList
                                ).map((name) => (
                                    <span key={name} style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem', borderRadius: 999, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                                        {stripOoo(name)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </Panel>
            )}

            {/* ═══════ ГРУППА 5: АНАЛИТИКА КЛИЕНТОВ ═══════ */}

            {/* 5.2 Lifetime Value (LTV) */}
            {useServiceRequest && !loading && !error && customerLtv && customerLtv.top10.length > 0 && showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Lifetime Value (LTV)</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Накопленная выручка по клиенту с момента первого заказа. Средний LTV: <span style={{ fontWeight: 600 }}>{Math.round(customerLtv.avgLtv).toLocaleString('ru-RU')} ₽</span> ({customerLtv.totalCustomers} клиентов)
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {customerLtv.top10.map((c, i) => {
                            const maxSum = customerLtv.top10[0]?.sum || 1;
                            return (
                                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600, width: 22, textAlign: 'right', color: i < 3 ? '#f59e0b' : 'var(--color-text-secondary)' }}>#{i + 1}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.75rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</Typography.Body>
                                    <div style={{ width: '30%', flexShrink: 0 }}>
                                        <div style={{ height: 10, borderRadius: 5, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={Math.round((c.sum / maxSum) * 100)} delay={i * 0.04} style={{ background: i < 3 ? '#f59e0b' : '#3b82f6', borderRadius: 5 }} />
                                        </div>
                                    </div>
                                    <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600, minWidth: 72, textAlign: 'right' }}>{Math.round(c.sum).toLocaleString('ru-RU')} ₽</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', minWidth: 40, textAlign: 'right' }}>{c.count} шт</Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            )}

            {/* 5.3 Churn-risk */}
            {useServiceRequest && !loading && !error && churnRisk && churnRisk.items.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Риск оттока клиентов</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Красная зона — нет заказов &gt;90 дней или интервал вырос в 3×. Жёлтая — &gt;45 дней или 2×. Зелёная — активные клиенты.
                    </Typography.Body>
                    <Flex gap="0.5rem" style={{ marginBottom: '0.6rem' }}>
                        <button type="button" onClick={() => setChurnRiskZone('red')} style={{ flex: 1, padding: '0.4rem 0.5rem', borderRadius: 8, background: churnRiskZone === 'red' ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)', border: churnRiskZone === 'red' ? '2px solid #ef4444' : '1px solid rgba(239,68,68,0.25)', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography.Body style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ef4444', display: 'block', lineHeight: 1.2 }}>{churnRisk.red}</Typography.Body>
                            <Typography.Body style={{ fontSize: '0.65rem', color: '#ef4444', display: 'block', lineHeight: 1.2 }}>Высокий риск</Typography.Body>
                        </button>
                        <button type="button" onClick={() => setChurnRiskZone('yellow')} style={{ flex: 1, padding: '0.4rem 0.5rem', borderRadius: 8, background: churnRiskZone === 'yellow' ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.1)', border: churnRiskZone === 'yellow' ? '2px solid #f59e0b' : '1px solid rgba(245,158,11,0.25)', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography.Body style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b', display: 'block', lineHeight: 1.2 }}>{churnRisk.yellow}</Typography.Body>
                            <Typography.Body style={{ fontSize: '0.65rem', color: '#f59e0b', display: 'block', lineHeight: 1.2 }}>Средний риск</Typography.Body>
                        </button>
                        <button type="button" onClick={() => setChurnRiskZone('green')} style={{ flex: 1, padding: '0.4rem 0.5rem', borderRadius: 8, background: churnRiskZone === 'green' ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.1)', border: churnRiskZone === 'green' ? '2px solid #10b981' : '1px solid rgba(16,185,129,0.25)', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography.Body style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981', display: 'block', lineHeight: 1.2 }}>{churnRisk.green}</Typography.Body>
                            <Typography.Body style={{ fontSize: '0.65rem', color: '#10b981', display: 'block', lineHeight: 1.2 }}>Активные</Typography.Body>
                        </button>
                    </Flex>
                    <div style={{ overflowX: 'auto', fontSize: '0.7rem' }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <thead>
                                <tr>
                                    {(() => {
                                        const toggleChurnSort = (col: typeof churnSortCol) => {
                                            if (churnSortCol === col) setChurnSortAsc(!churnSortAsc);
                                            else { setChurnSortCol(col); setChurnSortAsc(col === 'name' || col === 'status'); }
                                        };
                                        const churnArrow = (col: typeof churnSortCol) => churnSortCol === col ? (churnSortAsc ? ' ↑' : ' ↓') : '';
                                        const churnTh = (label: string, col: typeof churnSortCol, align: 'left' | 'center') => (
                                            <th key={col} style={{ padding: '0.3rem 0.4rem', textAlign: align, fontWeight: 600, borderBottom: '2px solid var(--color-border)', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleChurnSort(col)} title="Сортировка">{label}{churnArrow(col)}</th>
                                        );
                                        return (
                                            <>
                                                {churnTh('Клиент', 'name', 'left')}
                                                {churnTh('Заказы', 'orders', 'center')}
                                                {churnTh('Ø интервал', 'avgInterval', 'center')}
                                                {churnTh('Дней без заказа', 'daysSinceLast', 'center')}
                                                {churnTh('Статус', 'status', 'center')}
                                            </>
                                        );
                                    })()}
                                </tr>
                            </thead>
                            <tbody>
                                {[...churnRisk.items.filter(c => c.zone === churnRiskZone)]
                                    .sort((a, b) => {
                                        let cmp = 0;
                                        if (churnSortCol === 'name') cmp = a.name.localeCompare(b.name);
                                        else if (churnSortCol === 'orders') cmp = a.orders - b.orders;
                                        else if (churnSortCol === 'avgInterval') cmp = a.avgInterval - b.avgInterval;
                                        else if (churnSortCol === 'daysSinceLast') cmp = a.daysSinceLast - b.daysSinceLast;
                                        else cmp = (a.zone === b.zone ? 0 : (a.zone < b.zone ? -1 : 1));
                                        return churnSortAsc ? cmp : -cmp;
                                    })
                                    .map(c => {
                                    const zColor = { red: '#ef4444', yellow: '#f59e0b', green: '#10b981' }[c.zone];
                                    const zLabel = { red: 'Высокий', yellow: 'Средний', green: 'Активен' }[c.zone];
                                    return (
                                        <tr key={c.name}>
                                            <td style={{ padding: '0.25rem 0.4rem', borderBottom: '1px solid var(--color-border)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</td>
                                            <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>{c.orders}</td>
                                            <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>{c.avgInterval > 0 ? `${c.avgInterval} дн` : '—'}</td>
                                            <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)', fontWeight: 600 }}>{c.daysSinceLast}</td>
                                            <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
                                                <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: 999, background: `${zColor}18`, color: zColor, border: `1px solid ${zColor}44`, fontWeight: 600 }}>{zLabel}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            {/* 5.4 RFM-сегментация */}
            {useServiceRequest && !loading && !error && rfmSegments && rfmSegments.segments.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>RFM-сегментация</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Recency (давность) × Frequency (частота) × Monetary (сумма). Всего клиентов: {rfmSegments.total}. Нажмите на сегмент — список заказчиков.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {rfmSegments.segments.map((seg, ri) => {
                            const pct = rfmSegments.total > 0 ? Math.round((seg.count / rfmSegments.total) * 100) : 0;
                            const isExpanded = expandedRfmSegment === seg.name;
                            return (
                                <div key={seg.name}>
                                    <button type="button" onClick={() => setExpandedRfmSegment(isExpanded ? null : seg.name)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', background: isExpanded ? 'var(--color-bg-hover)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
                                        <Typography.Body style={{ fontSize: '0.75rem', width: 130, flexShrink: 0, fontWeight: 600 }}>{seg.name}</Typography.Body>
                                        <div style={{ flex: 1, height: 16, borderRadius: 8, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={pct} delay={ri * 0.04} style={{ background: seg.color, borderRadius: 8, minWidth: pct > 0 ? 4 : 0 }} />
                                        </div>
                                        <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{seg.count}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', minWidth: 30, textAlign: 'right' }}>{pct}%</Typography.Body>
                                        {showSums && <Typography.Body style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', minWidth: 70, textAlign: 'right' }}>Ø {Math.round(seg.avgSum).toLocaleString('ru-RU')} ₽</Typography.Body>}
                                    </button>
                                    {isExpanded && rfmSegments.customersBySegment && rfmSegments.customersBySegment[seg.name] && (
                                        <div style={{ marginTop: '0.35rem', marginBottom: '0.25rem', marginLeft: 8, padding: '0.5rem 0.6rem', background: 'var(--color-bg-hover)', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
                                            <Typography.Body style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.35rem', color: seg.color }}>Заказчики ({rfmSegments.customersBySegment[seg.name].length})</Typography.Body>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                {rfmSegments.customersBySegment[seg.name].map((c, i) => (
                                                    <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem' }}>
                                                        <Typography.Body style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</Typography.Body>
                                                        {showSums && <Typography.Body style={{ flexShrink: 0, fontWeight: 600 }}>{Math.round(c.monetary).toLocaleString('ru-RU')} ₽</Typography.Body>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <Flex gap="0.4rem" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        {rfmSegments.segments.map(s => (
                            <Flex key={s.name} align="center" gap="0.2rem">
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                                <Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>{s.name}</Typography.Body>
                            </Flex>
                        ))}
                    </Flex>
                </Panel>
            )}

            {/* 5.5 Платёжная дисциплина */}
            {useServiceRequest && !loading && !error && paymentDiscipline && paymentDiscipline.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Платёжная дисциплина</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Доля оплаченных перевозок по каждому клиенту. Чем ниже процент оплаты — тем хуже дисциплина.
                    </Typography.Body>
                    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320, fontSize: '0.7rem', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-bg-hover)', position: 'sticky', top: 0, zIndex: 1 }}>
                                    {(() => {
                                        const togglePaySort = (col: typeof paymentDisciplineSortCol) => {
                                            if (paymentDisciplineSortCol === col) setPaymentDisciplineSortAsc(!paymentDisciplineSortAsc);
                                            else { setPaymentDisciplineSortCol(col); setPaymentDisciplineSortAsc(col === 'name'); }
                                        };
                                        const payArrow = (col: typeof paymentDisciplineSortCol) => paymentDisciplineSortCol === col ? (paymentDisciplineSortAsc ? ' ↑' : ' ↓') : '';
                                        const payTh = (label: string, col: typeof paymentDisciplineSortCol, align: 'left' | 'center') => (
                                            <th key={col} style={{ padding: '0.3rem 0.4rem', textAlign: align, fontWeight: 600, borderBottom: '2px solid var(--color-border)', cursor: 'pointer', userSelect: 'none', background: 'var(--color-bg-hover)' }} onClick={() => togglePaySort(col)} title="Сортировка">{label}{payArrow(col)}</th>
                                        );
                                        return (
                                            <>
                                                {payTh('Клиент', 'name', 'left')}
                                                {payTh('Всего', 'count', 'center')}
                                                {payTh('Оплачено', 'paid', 'center')}
                                                {payTh('Не оплач.', 'unpaid', 'center')}
                                                {payTh('% оплаты', 'paidRate', 'center')}
                                            </>
                                        );
                                    })()}
                                </tr>
                            </thead>
                            <tbody>
                                {[...paymentDiscipline]
                                    .sort((a, b) => {
                                        let cmp = 0;
                                        if (paymentDisciplineSortCol === 'name') cmp = a.name.localeCompare(b.name);
                                        else if (paymentDisciplineSortCol === 'count') cmp = a.count - b.count;
                                        else if (paymentDisciplineSortCol === 'paid') cmp = a.paid - b.paid;
                                        else if (paymentDisciplineSortCol === 'unpaid') cmp = a.unpaid - b.unpaid;
                                        else cmp = a.paidRate - b.paidRate;
                                        return paymentDisciplineSortAsc ? cmp : -cmp;
                                    })
                                    .map((c, pi) => {
                                    const color = c.paidRate >= 80 ? '#10b981' : c.paidRate >= 50 ? '#f59e0b' : '#ef4444';
                                    return (
                                        <tr key={c.name}>
                                            <td style={{ padding: '0.25rem 0.4rem', borderBottom: '1px solid var(--color-border)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</td>
                                            <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>{c.count}</td>
                                            <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)', color: '#10b981', fontWeight: 600 }}>{c.paid}</td>
                                            <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)', color: '#ef4444', fontWeight: 600 }}>{c.unpaid}</td>
                                            <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                                                    <div style={{ width: 40, height: 6, borderRadius: 3, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                                        <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={c.paidRate} delay={Math.min(pi * 0.012, 0.35)} style={{ background: color, borderRadius: 3 }} />
                                                    </div>
                                                    <span style={{ fontWeight: 600, color }}>{c.paidRate}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            {/* 5.6 Маржинальность по клиентам */}
            {useServiceRequest && !loading && !error && customerMargin && customerMargin.length > 0 && showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Выручка на кг по клиентам</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Стоимость перевозки на 1 кг платного веса. Чем выше — тем выгоднее клиент.
                    </Typography.Body>
                    <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {customerMargin.map((c, i) => {
                            const maxPerKg = Math.max(...customerMargin.map(x => x.perKg), 1);
                            return (
                                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Typography.Body style={{ fontSize: '0.75rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</Typography.Body>
                                    <div style={{ width: '25%', flexShrink: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={Math.round((c.perKg / maxPerKg) * 100)} delay={i * 0.025} style={{ background: i < 3 ? '#10b981' : '#3b82f6', borderRadius: 4 }} />
                                        </div>
                                    </div>
                                    <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600, minWidth: 55, textAlign: 'right' }}>{c.perKg.toFixed(1)} ₽/кг</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', minWidth: 60, textAlign: 'right' }}>{Math.round(c.sum).toLocaleString('ru-RU')} ₽</Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            )}

            {/* 5.7 География клиентов */}
            {useServiceRequest && !loading && !error && clientGeography && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>География клиентов</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Популярные маршруты и концентрация грузов по городам.
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Топ маршрутов</Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                        {clientGeography.topRoutes.map((r, i) => {
                            const maxC = clientGeography.topRoutes[0]?.count || 1;
                            return (
                                <div key={r.route} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Typography.Body style={{ fontSize: '0.72rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.route}</Typography.Body>
                                    <div style={{ width: '25%', flexShrink: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={Math.round((r.count / maxC) * 100)} delay={i * 0.035} style={{ background: '#8b5cf6', borderRadius: 4 }} />
                                        </div>
                                    </div>
                                    <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>{r.count}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', minWidth: 55, textAlign: 'right' }}>{Math.round(r.pw).toLocaleString('ru-RU')} кг</Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                    <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>Топ городов</Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {clientGeography.topCities.map((c, ci) => {
                            const maxC = clientGeography.topCities[0]?.total || 1;
                            return (
                                <div key={c.city} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Typography.Body style={{ fontSize: '0.72rem', width: 90, flexShrink: 0, fontWeight: 600 }}>{c.city}</Typography.Body>
                                    <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--color-bg-hover)', overflow: 'hidden', display: 'flex' }}>
                                        <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={Math.round((c.sent / maxC) * 100)} delay={ci * 0.05} style={{ background: '#3b82f6' }} />
                                        <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={Math.round((c.received / maxC) * 100)} delay={ci * 0.05 + 0.06} style={{ background: '#f59e0b' }} />
                                    </div>
                                    <Typography.Body style={{ fontSize: '0.68rem', minWidth: 70, textAlign: 'right' }}>
                                        <span style={{ color: '#3b82f6' }}>↑{c.sent}</span>{' '}<span style={{ color: '#f59e0b' }}>↓{c.received}</span>
                                    </Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                    <Flex gap="0.5rem" style={{ marginTop: '0.35rem' }}>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Отправка</Typography.Body></Flex>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Получение</Typography.Body></Flex>
                    </Flex>
                </Panel>
            )}

            {/* 5.8 Сезонность по клиентам */}
            {useServiceRequest && !loading && !error && clientSeasonality && clientSeasonality.rows.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Сезонность по клиентам</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Интенсивность грузопотока по месяцам. Чем ярче ячейка — тем больше заказов. Помогает выявить сезонных и стабильных клиентов.
                    </Typography.Body>
                    <div style={{ overflowX: 'auto', fontSize: '0.68rem' }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '0.25rem 0.3rem', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid var(--color-border)', whiteSpace: 'nowrap' }}>Клиент</th>
                                    {['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'].map((m, i) => (
                                        <th key={i} style={{ padding: '0.25rem 0.2rem', textAlign: 'center', fontWeight: 500, borderBottom: '2px solid var(--color-border)', width: 28 }}>{m}</th>
                                    ))}
                                    <th style={{ padding: '0.25rem 0.3rem', textAlign: 'right', fontWeight: 600, borderBottom: '2px solid var(--color-border)' }}>Σ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clientSeasonality.rows.map(row => (
                                    <tr key={row.name}>
                                        <td style={{ padding: '0.2rem 0.3rem', borderBottom: '1px solid var(--color-border)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>{row.name}</td>
                                        {row.months.map((cnt, mi) => {
                                            const intensity = cnt / clientSeasonality.maxVal;
                                            return (
                                                <td key={mi} style={{
                                                    padding: '0.2rem 0.15rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)',
                                                    background: cnt > 0 ? `rgba(37,99,235,${0.1 + intensity * 0.6})` : 'transparent',
                                                    color: intensity > 0.5 ? 'white' : 'var(--color-text-primary)', fontWeight: cnt > 0 ? 600 : 400,
                                                }}>
                                                    {cnt > 0 ? cnt : ''}
                                                </td>
                                            );
                                        })}
                                        <td style={{ padding: '0.2rem 0.3rem', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>{row.total}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            {/* 5.9 Средний чек / средний вес */}
            {useServiceRequest && !loading && !error && avgCheckTrend && avgCheckTrend.length > 1 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Средний чек и вес</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Динамика среднего чека (₽) и среднего платного веса (кг) по месяцам. Показывает тренд стоимости и объёма заказов.
                    </Typography.Body>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100, marginBottom: '0.25rem' }}>
                        {avgCheckTrend.map((m, i) => {
                            const maxAvgPw = Math.max(...avgCheckTrend.map(x => x.avgPw), 1);
                            const h = Math.round((m.avgPw / maxAvgPw) * 90);
                            return (
                                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <Typography.Body style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{m.avgPw}</Typography.Body>
                                    <DashboardChartBarPixelHeight enabled={chartBarFillEnabled} heightPx={h} delay={i * 0.05} style={{ background: '#3b82f6', borderRadius: '4px 4px 0 0' }} />
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                        {avgCheckTrend.map(m => (
                            <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                                <Typography.Body style={{ fontSize: '0.55rem', color: 'var(--color-text-secondary)' }}>{m.month.slice(2)}</Typography.Body>
                            </div>
                        ))}
                    </div>
                    {showSums && (
                        <div style={{ display: 'flex', gap: 3, marginTop: '0.35rem' }}>
                            {avgCheckTrend.map(m => (
                                <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                                    <Typography.Body style={{ fontSize: '0.55rem', color: '#f59e0b', fontWeight: 600 }}>{m.avgSum.toLocaleString('ru-RU')} ₽</Typography.Body>
                                </div>
                            ))}
                        </div>
                    )}
                    <Flex gap="0.5rem" style={{ marginTop: '0.35rem' }}>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Средний вес (кг)</Typography.Body></Flex>
                        {showSums && <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Средний чек (₽)</Typography.Body></Flex>}
                    </Flex>
                </Panel>
            )}

            {/* 5.10 Предпочтения по типу доставки */}
            {useServiceRequest && !loading && !error && deliveryPreferences && deliveryPreferences.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Предпочтения по типу доставки</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Доля паром vs авто по клиентам. Помогает выявить предпочтения и потенциал для переключения на другой тип.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {deliveryPreferences.map((c, di) => (
                            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Typography.Body style={{ fontSize: '0.72rem', width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</Typography.Body>
                                <div style={{ flex: 1, height: 14, borderRadius: 7, background: 'var(--color-bg-hover)', overflow: 'hidden', display: 'flex' }}>
                                    {c.ferry > 0 && <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={c.ferryPct} delay={di * 0.04} style={{ background: '#3b82f6' }} />}
                                    {c.auto > 0 && <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={100 - c.ferryPct} delay={di * 0.04 + 0.07} style={{ background: '#f59e0b' }} />}
                                </div>
                                <Typography.Body style={{ fontSize: '0.65rem', minWidth: 60, textAlign: 'right' }}>
                                    <span style={{ color: '#3b82f6' }}>{c.ferry}</span>/<span style={{ color: '#f59e0b' }}>{c.auto}</span>
                                </Typography.Body>
                            </div>
                        ))}
                    </div>
                    <Flex gap="0.5rem" style={{ marginTop: '0.35rem' }}>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Паром</Typography.Body></Flex>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Авто</Typography.Body></Flex>
                    </Flex>
                </Panel>
            )}

            {/* ═══════ ГРУППА 6: КАДРЫ ═══════ */}

            {canViewTimesheetCostDashboard && !loading && !error && !isVisibilityDeniedError(timesheetAnalyticsError) && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        ФОТ
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        В разрезе стоимости на 1 кг платного веса за выбранный период
                    </Typography.Body>
                    <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginTop: '-0.25rem', marginBottom: '0.55rem' }}>
                        <select
                            className="admin-form-input"
                            value={timesheetDashboardPeriod.month}
                            onChange={(e) => {
                                const month = Number(e.target.value);
                                if (!Number.isFinite(month) || month < 1 || month > 12) return;
                                setTimesheetDashboardPeriod((prev) => ({ ...prev, month }));
                            }}
                            style={{ padding: '0 0.5rem', minWidth: '10rem' }}
                            aria-label="Месяц ФОТ"
                        >
                            {MONTH_NAMES.map((name, idx) => (
                                <option key={`timesheet-dashboard-month-${idx + 1}`} value={idx + 1}>{name.charAt(0).toUpperCase() + name.slice(1)}</option>
                            ))}
                        </select>
                        <select
                            className="admin-form-input"
                            value={timesheetDashboardPeriod.year}
                            onChange={(e) => {
                                const year = Number(e.target.value);
                                if (!Number.isFinite(year)) return;
                                setTimesheetDashboardPeriod((prev) => ({ ...prev, year }));
                            }}
                            style={{ padding: '0 0.5rem', minWidth: '6.5rem' }}
                            aria-label="Год ФОТ"
                        >
                            {timesheetDashboardYearOptions.map((year) => (
                                <option key={`timesheet-dashboard-year-${year}`} value={year}>{year}</option>
                            ))}
                        </select>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '-0.35rem', marginBottom: '0.75rem' }}>
                        Расчетный период: <DateText value={timesheetDashboardDateRange.dateFrom} /> – <DateText value={timesheetDashboardDateRange.dateTo} />
                    </Typography.Body>
                    {timesheetAnalyticsLoading ? (
                        <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка аналитики табеля...</Typography.Body></Flex>
                    ) : timesheetAnalyticsError ? (
                        <Typography.Body style={{ color: 'var(--color-error)' }}>{timesheetAnalyticsError}</Typography.Body>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>ФОТ</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 600 }}>{Math.round(companyTimesheetSummary.totalMoney).toLocaleString('ru-RU')} ₽</Typography.Body>
                                    </div>
                                </div>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Платный вес</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 600 }}>{Math.round(timesheetPaidWeight).toLocaleString('ru-RU')} кг</Typography.Body>
                                    </div>
                                </div>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Стоимость на 1 кг</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 700, color: '#2563eb' }}>{timesheetCostPerKg.toFixed(2)} ₽/кг</Typography.Body>
                                    </div>
                                </div>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Выплаты</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 600, color: '#065f46' }}>{Math.round(companyTimesheetSummary.totalPaid).toLocaleString('ru-RU')} ₽</Typography.Body>
                                    </div>
                                </div>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Остаток</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 700, color: '#b45309' }}>{Math.round(companyTimesheetSummary.totalOutstanding).toLocaleString('ru-RU')} ₽</Typography.Body>
                                    </div>
                                </div>
                            </div>
                            <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: '0.75rem', marginBottom: '0.4rem' }}>
                                По подразделениям
                            </Typography.Body>
                            {timesheetByDepartment.length === 0 ? (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                    Нет данных по подразделениям за выбранный период.
                                </Typography.Body>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    {timesheetByDepartment.map((row) => (
                                        <div key={`timesheet-dep-${row.department}`} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.3rem' }}>
                                            <Flex align="center" justify="space-between" gap="0.5rem">
                                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>{row.department}</Typography.Body>
                                                <Flex align="center" justify="flex-end" gap="0.35rem" wrap="wrap">
                                                    <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 600 }}>
                                                        {Math.round(row.totalCost).toLocaleString('ru-RU')} ₽
                                                    </span>
                                                    <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #86efac', background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                                                        {Math.round(row.totalPaid || 0).toLocaleString('ru-RU')} ₽
                                                    </span>
                                                    <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #fcd34d', background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                                                        {Math.round(row.totalOutstanding || 0).toLocaleString('ru-RU')} ₽
                                                    </span>
                                                </Flex>
                                            </Flex>
                                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                                Сотрудников: {row.employeeCount} · Часы: {Number(row.totalHours.toFixed(1))} · Смены: {row.totalShifts} · Доля: {row.share.toFixed(1)}% · 1 кг: {row.costPerKg.toFixed(2)} ₽/кг
                                            </Typography.Body>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </Panel>
            )}

            </DashboardMotionItem>
            </DashboardMotionGroup>

            {/* === ВИДЖЕТ 5: Платёжный календарь (включить: WIDGET_5_PAYMENT_CALENDAR = true) === */}
            {false && WIDGET_5_PAYMENT_CALENDAR && showPaymentCalendar && !loading && !error && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Платёжный календарь</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        Рекомендуемые дни оплаты выставленных и неоплаченных счетов
                    </Typography.Body>
                    {paymentCalendarLoading ? (
                        <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка условий оплаты...</Typography.Body></Flex>
                    ) : (
                        <>
                            <Flex align="center" gap="0.5rem" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem' }} onClick={() => setPaymentCalendarMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))}>←</Button>
                                <Typography.Body style={{ fontWeight: 600, minWidth: '10rem', textAlign: 'center' }}>
                                    {['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][paymentCalendarMonth.month - 1]} {paymentCalendarMonth.year}
                                </Typography.Body>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem' }} onClick={() => setPaymentCalendarMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))}>→</Button>
                                <Button
                                    type="button"
                                    className="filter-button"
                                    style={{ padding: '0.35rem 0.55rem' }}
                                    title="Текущий месяц"
                                    onClick={() => {
                                        const n = new Date();
                                        setPaymentCalendarMonth({ year: n.getFullYear(), month: n.getMonth() + 1 });
                                    }}
                                >
                                    Сегодня
                                </Button>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem', marginLeft: '0.25rem' }} onClick={() => mutateCalendarInvoices()} title="Обновить счета с начала текущего года" aria-label="Обновить счета">
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </Flex>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0.5rem' }}>
                                <div className="payment-calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(2.5rem, 1fr))', gap: '2px', fontSize: '0.75rem', minWidth: '22rem' }}>
                                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'За неделю'].map((wd) => (
                                        <div key={wd} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600, padding: '0.25rem' }}>{wd}</div>
                                    ))}
                                    {(() => {
                                        const { year, month } = paymentCalendarMonth;
                                        const first = new Date(year, month - 1, 1);
                                        const lastDay = new Date(year, month, 0).getDate();
                                        const startOffset = (first.getDay() + 6) % 7;
                                        const cells: { day: number | null; key: string | null; dow: number }[] = [];
                                        for (let i = 0; i < startOffset; i++) cells.push({ day: null, key: null, dow: i });
                                        for (let d = 1; d <= lastDay; d++) {
                                            const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                            const date = new Date(year, month - 1, d);
                                            const dow = (date.getDay() + 6) % 7;
                                            cells.push({ day: d, key, dow });
                                        }
                                        const weeks: { cells: typeof cells }[] = [];
                                        for (let i = 0; i < cells.length; i += 7) {
                                            const chunk = cells.slice(i, i + 7);
                                            while (chunk.length < 7) chunk.push({ day: null, key: null, dow: chunk.length });
                                            weeks.push({ cells: chunk });
                                        }
                                        return weeks.flatMap(({ cells: weekCells }, wi) => {
                                            let weekSum = 0;
                                            for (let i = 0; i < 7; i++) {
                                                const c = weekCells[i];
                                                if (c?.key) {
                                                    const e = plannedByDate.get(c.key);
                                                    if (e?.total) weekSum += e.total;
                                                }
                                            }
                                            const monFri = weekCells.slice(0, 5);
                                            const row: React.ReactNode[] = monFri.map((c, i) => {
                                                const entry = c.key ? plannedByDate.get(c.key) : undefined;
                                                const sum = entry?.total;
                                                const hasSum = sum != null && sum > 0;
                                                return (
                                                    <div
                                                        key={`w${wi}-${i}-${c.key ?? ''}`}
                                                        className="payment-calendar-day-cell"
                                                        role={hasSum ? 'button' : undefined}
                                                        tabIndex={hasSum ? 0 : undefined}
                                                        onClick={hasSum && c.key ? () => setPaymentCalendarSelectedDate(c.key) : undefined}
                                                        onKeyDown={hasSum && c.key ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPaymentCalendarSelectedDate(c.key); } } : undefined}
                                                        style={{
                                                            padding: '0.35rem',
                                                            textAlign: 'center',
                                                            borderRadius: 4,
                                                            background: hasSum ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                                            color: hasSum ? 'white' : 'var(--color-text-secondary)',
                                                            minHeight: '2.25rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: hasSum ? 'pointer' : undefined,
                                                        }}
                                                        title={c.key && hasSum ? `${c.key}: ${Math.round(sum!).toLocaleString('ru-RU')} ₽` : undefined}
                                                    >
                                                        {c.day != null ? c.day : ''}
                                                        {hasSum && <span className="payment-calendar-day-amount" style={{ fontSize: '0.65rem', lineHeight: 1 }}>{formatCurrency(sum!, true)}</span>}
                                                    </div>
                                                );
                                            });
                                            row.push(
                                                <div
                                                    key={`week-${wi}`}
                                                    className="payment-calendar-week-total"
                                                    style={{
                                                        padding: '0.35rem',
                                                        textAlign: 'center',
                                                        borderRadius: 4,
                                                        background: weekSum > 0 ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                                        color: weekSum > 0 ? 'white' : 'var(--color-text-secondary)',
                                                        minHeight: '2.25rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: weekSum > 0 ? 600 : undefined,
                                                    }}
                                                >
                                                    {weekSum > 0 ? formatCurrency(weekSum, true) : '—'}
                                                </div>
                                            );
                                            return row;
                                        });
                                    })()}
                                </div>
                            </div>
                            {paymentCalendarSelectedDate && plannedByDate.get(paymentCalendarSelectedDate) && (
                                <div className="modal-overlay" style={{ zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="payment-calendar-day-title" onClick={() => setPaymentCalendarSelectedDate(null)}>
                                    <div className="modal-content" style={{ maxWidth: '22rem', padding: '1rem', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                                        <Typography.Body id="payment-calendar-day-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                                            Плановое поступление — {paymentCalendarSelectedDate}
                                        </Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                                            Заказчики и суммы:
                                        </Typography.Body>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            {plannedByDate.get(paymentCalendarSelectedDate)!.items.map((row, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--color-border)' }}>
                                                    <Typography.Body style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.customer}>{row.customer}</Typography.Body>
                                                    <Typography.Body style={{ fontWeight: 600, flexShrink: 0 }}>{formatCurrency(row.sum, true)}</Typography.Body>
                                                </div>
                                            ))}
                                        </div>
                                        <Flex justify="space-between" align="center" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)', fontWeight: 600 }}>
                                            <Typography.Body>Итого:</Typography.Body>
                                            <Typography.Body>{formatCurrency(plannedByDate.get(paymentCalendarSelectedDate)!.total, true)}</Typography.Body>
                                        </Flex>
                                        <Button type="button" className="filter-button" style={{ marginTop: '0.75rem', width: '100%' }} onClick={() => setPaymentCalendarSelectedDate(null)}>Закрыть</Button>
                                    </div>
                                </div>
                            )}
                            {plannedByDate.size === 0 && !paymentCalendarLoading && (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                                    Нет данных за выбранный период или условия оплаты не заданы в справочнике.
                                </Typography.Body>
                            )}
                        </>
                    )}
                </Panel>
            )}
            
            <FilterDialog 
                isOpen={isCustomModalOpen} 
                onClose={() => setIsCustomModalOpen(false)} 
                dateFrom={customDateFrom} 
                dateTo={customDateTo} 
                onApply={(f, t) => { 
                    setCustomDateFrom(f); 
                    setCustomDateTo(t); 
                }} 
            />
        </div>
    );
}
