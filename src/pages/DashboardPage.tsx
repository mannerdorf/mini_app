/**
 * Секретный дашборд: виджеты перевозок, SLA, платёжный календарь, таймшит.
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
import { formatCurrency, stripOoo, cityToCode, normalizeInvoiceStatus } from "../lib/formatUtils";
import { usePerevozki, usePrevPeriodPerevozki, useInvoices } from "../hooks/useApi";
import { fetchPerevozkaTimeline } from "../lib/perevozkaDetails";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { DateText } from "../components/ui/DateText";
import { FilterDialog } from "../components/shared/FilterDialog";
import { CustomPeriodModal } from "../components/modals/CustomPeriodModal";
import { getWebApp, isMaxWebApp } from "../webApp";
import type { AuthData, CargoItem, DateFilter, PerevozkaTimelineStep, StatusFilter } from "../types";

const {
    loadDateFilterState,
    saveDateFilterState,
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

export type DashboardPageProps = {
    auth: AuthData;
    onClose: () => void;
    onOpenCargoFilters: (filters: { status?: StatusFilter; search?: string }) => void;
    showSums?: boolean;
    useServiceRequest?: boolean;
    hasAnalytics?: boolean;
    hasDashboard?: boolean;
};

export function DashboardPage({
    auth,
    onClose,
    onOpenCargoFilters,
    showSums = true,
    useServiceRequest = false,
    hasAnalytics = false,
    hasDashboard = true,
}: DashboardPageProps) {
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

    // Filters State (такие же как на странице грузов); при переключении вкладок восстанавливаем из localStorage
    const initDate = () => loadDateFilterState();
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
        saveDateFilterState({ dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter });
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
    const cargoFlowByPlan = useMemo(() => {
        const dateToKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const parseKey = (value: unknown): string | null => {
            const raw = String(value ?? '').trim();
            if (!raw) return null;
            if (/^0?1[./-]0?1[./-](1900|1901|0001)$/.test(raw)) return null;
            const parsedByUtils = dateUtils.parseDateOnly(raw);
            if (parsedByUtils && parsedByUtils.getFullYear() > 1901) return dateToKey(parsedByUtils);
            const fallback = new Date(raw);
            if (!Number.isFinite(fallback.getTime()) || fallback.getFullYear() <= 1901) return null;
            return dateToKey(fallback);
        };
        const getPlannedKey = (item: CargoItem): string | null => {
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
                const key = parseKey(candidate);
                if (key) return key;
            }
            return null;
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
                const key = parseKey(candidate);
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
    }, [filteredItems]);

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
            const dateKey = item.DatePrih.split('T')[0];
            const displayDate = formatDate(item.DatePrih);
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
        variant: MainChartVariant
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
        
        // Округляем значения до целых
        const roundedData = data.map(d => ({ ...d, value: Math.round(d.value) }));
        const maxValue = Math.max(...roundedData.map(d => d.value), 1);
        const scaleMax = maxValue * 1.1; // Максимум шкалы = max + 10%
        
        const chartHeight = 125;
        const paddingLeft = 60;
        const paddingRight = 30;
        const paddingTop = 16;
        const paddingBottom = 45;
        const availableWidth = 350;
        const barSpacing = 6;
        const barWidth = Math.max(12, (availableWidth - paddingLeft - paddingRight - (roundedData.length - 1) * barSpacing) / roundedData.length);
        const chartWidth = paddingLeft + paddingRight + roundedData.length * (barWidth + barSpacing) - barSpacing;
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
                <div style={{ overflowX: 'auto', width: '100%' }}>
                    <svg 
                        width={Math.max(chartWidth, '100%')} 
                        height={chartHeight}
                        style={{ minWidth: `${chartWidth}px`, display: 'block' }}
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
                                        {d.date.split('.').slice(0, 2).join('.')}
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
        const w = 220;
        const h = 88;
        const left = 8;
        const right = 8;
        const top = 8;
        const bottom = 18;
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
                                <div style={{ width: `${(v / maxTop) * 100}%`, height: '100%', background: color }} />
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

    if (!auth?.login || !auth?.password) {
        return (
            <div className="w-full p-4">
                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нет доступа к дашборду. Выберите аккаунт в профиле.</Typography.Body>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* === ВИДЖЕТ 1: Фильтры (включить: WIDGET_1_FILTERS = true) === */}
            {WIDGET_1_FILTERS && (
            <div className="cargo-page-sticky-header" style={{ marginBottom: '1rem' }}>
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

            {/* === ВИДЖЕТ 2: Полоска с периодом и типом графика (включить: WIDGET_2_STRIP = true) === */}
            {WIDGET_2_STRIP && showSums && (
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
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
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
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
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
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
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
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
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
                                        <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4 }} />
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
                                        <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4 }} />
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
                                        <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4 }} />
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
            )}

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
            
            {/* === ВИДЖЕТ 3: График динамики (включить: WIDGET_3_CHART = true) === */}
            {WIDGET_3_CHART && !loading && !error && showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
                    {renderChart(selectedChartConfig.data, selectedChartConfig.title, selectedChartConfig.color, selectedChartConfig.formatValue, mainChartVariant)}
                    <div style={{ marginTop: '0.85rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.7rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                            Стиль графика (нажми на миниатюру)
                        </Typography.Body>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.45rem' }}>
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
                                        borderRadius: 8,
                                        padding: '0.32rem',
                                        background: variant.key === mainChartVariant ? 'rgba(37,99,235,0.08)' : 'var(--color-bg-hover)',
                                        textAlign: 'left',
                                    }}
                                    title={`Выбрать: ${variant.label}`}
                                >
                                    <Typography.Body style={{ fontSize: '0.72rem', marginBottom: '0.25rem', color: 'var(--color-text-secondary)' }}>
                                        {variant.label}
                                    </Typography.Body>
                                    {renderChartVariantPreview(selectedChartConfig.data, selectedChartConfig.color, variant.key)}
                                </button>
                            ))}
                        </div>
                    </div>
                </Panel>
            )}

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

            {!showOnlySla && !loading && !error && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Cargo Flow (по плановой дате)
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
                                const [year, month, day] = row.key.split('-').map((v) => Number(v));
                                const date = new Date(year, (month || 1) - 1, day || 1);
                                const weekday = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][date.getDay()] ?? '';
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
                                            {weekday}, <DateText value={row.key} />
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
                                            <Typography.Body style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                                                Мест: {Math.round(row.mest).toLocaleString('ru-RU')}
                                            </Typography.Body>
                                            <Typography.Body style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                                                Вес: {Math.round(row.pw).toLocaleString('ru-RU')} кг
                                            </Typography.Body>
                                            <Typography.Body style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
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

            {/* === ВИДЖЕТ 4: Монитор SLA (включить: WIDGET_4_SLA = true); в режиме "только SLA" показываем даже при 0 перевозок === */}
            {WIDGET_4_SLA && !loading && !error && (slaStats.total > 0 || showOnlySla) && (
                <Panel className="cargo-card sla-monitor-panel" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.5rem' }}>
                    <Flex align="center" justify="space-between" className="sla-monitor-header" style={{ marginBottom: '0.75rem' }}>
                        <Typography.Headline style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                            Монитор SLA
                        </Typography.Headline>
                        {slaStats.total > 0 && slaTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} title="Динамика SLA улучшается" />}
                        {slaStats.total > 0 && slaTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} title="Динамика SLA ухудшается" />}
                    </Flex>
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
                            <div
                                style={{
                                    width: `${slaStats.percentOnTime}%`,
                                    height: '100%',
                                    borderRadius: 6,
                                    background: `linear-gradient(90deg, var(--color-success-status) 0%, #f59e0b 50%, #ef4444 100%)`,
                                    transition: 'width 0.3s ease',
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
                            <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                                Топ сотрудников по затратам
                            </Typography.Body>
                            {topEmployeesByTimesheetCost.length === 0 ? (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                    Нет данных табеля за выбранный период.
                                </Typography.Body>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    {topEmployeesByTimesheetCost.map((row) => (
                                        <div key={`timesheet-top-${row.employeeId}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.25rem' }}>
                                            <Typography.Body style={{ fontSize: '0.8rem' }}>
                                                {row.fullName || `Сотрудник #${row.employeeId}`} {row.department ? `· ${row.department}` : ''}
                                            </Typography.Body>
                                            <Flex align="center" gap="0.5rem" wrap="wrap" justify="flex-end">
                                                <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 600 }}>
                                                    {Math.round(Number(row.totalCost || 0)).toLocaleString('ru-RU')} ₽
                                                </span>
                                                <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #86efac', background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                                                    {Math.round(Number(row.totalPaid || 0)).toLocaleString('ru-RU')} ₽
                                                </span>
                                                <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #fcd34d', background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                                                    {Math.round(Number(row.totalOutstanding || 0)).toLocaleString('ru-RU')} ₽
                                                </span>
                                            </Flex>
                                        </div>
                                    ))}
                                </div>
                            )}
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
