/**
 * Dashboard page state hook.: виджеты перевозок, SLA, платёжный календарь, таймшит.
 */
import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import {
    Loader2, X, ChevronDown, Calendar, Filter, Package, Scale, Weight, Maximize, CreditCard, Check,
    AlertTriangle, Info, Ship, Truck, ArrowDown, ArrowUp, ArrowLeft, TrendingUp, TrendingDown, Minus, RussianRuble, List, RefreshCw,
} from "lucide-react";
import * as dateUtils from "../lib/dateUtils";
import {
    getFilterKeyByStatus,
    getPaymentFilterKey,
    isReceivedInfoStatus,
    BILL_STATUS_MAP,
    STATUS_MAP,
} from "../lib/statusUtils";
import {
    initSharedFilterSets,
    saveSharedVisibleListFilters,
    routeKeyToCargoLabel,
    type CargoStatusFilterKey,
    type RouteFilterKey,
    type SharedBillStatusKey,
    type TypeFilterKey,
} from "../lib/sharedListFilters";
import { formatDateFilterButtonLabel, useListDateRange, usePersistedDateFilter } from "../features/listWorkspace";
import { normalizeStatus } from "../lib/statusUtils";
import { workingDaysBetween, workingDaysInPlan, type WorkSchedule } from "../lib/slaWorkSchedule";
import { getSlaInfo, getPlanDays, getInnFromCargo, isFerry, getSlaPlanDeadlineMs, cargoLastMileIsSelfPickup, cargoPickupLogisticsIsTerminalTo, CARGO_ROLE_FILTER_LABELS, type CargoRoleFilterKey } from "../lib/cargoUtils";
import { buildFilteredCargoItems } from "./cargoPipeline";
import { formatCurrency, formatInvoiceNumber, stripOoo, cityToCode, normalizeInvoiceStatus } from "../lib/formatUtils";
import { getFirstCargoNumberFromInvoice, buildCargoStateByNumber, filterCargoItemsForHeaderCustomer, filterItemsForHeaderCustomer } from "../features/documents/lib/documentsPipeline";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import { usePerevozki, usePrevPeriodPerevozki, useInvoices } from "../hooks/useApi";
import { getWebApp, isMaxWebApp } from "../webApp";
import { sendMaxTestMessage } from "../api/client/dashboard";
import { fetchCustomerWorkSchedules, fetchMyPaymentCalendar } from "../api/client/scheduling";
import type { AuthData, CargoItem, DateFilter, PerevozkaTimelineStep, StatusFilter } from "../types";
import {
    DASH_ROLE_FILTER_KEY,
    DASH_PLAN_FACT_TYPO,
    loadDashboardRoleFilter,
    DashboardChartBarH,
    DashboardChartBarPixelHeight,
    CHART_BAR_FILL_DURATION,
    CHART_BAR_FILL_EASE,
    calcStripDynamics,
    StripDynamicsBadge,
    cargoFlowSelectionEqual,
    type CargoFlowTableSelection,
    type CombinedLogisticsBucketKey,
    type DashboardChartPoint,
} from "../features/dashboard";

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
    onOpenCargo?: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
    onOpenInvoice?: (invoice: Record<string, unknown>) => void;
    onOpenDocumentsEdo?: () => void;
    onOpenDocumentsInvoices?: () => void;
};


export type DashboardPageState = ReturnType<typeof useDashboardPageState>;

export function useDashboardPageState({
    auth,
    onClose,
    onOpenCargoFilters,
    showSums = true,
    useServiceRequest = false,
    hasAnalytics = false,
    hasDashboard = true,
    saasDashboardMotion = false,
    onOpenCargo,
    onOpenInvoice,
    onOpenDocumentsEdo,
    onOpenDocumentsInvoices,
}: DashboardPageProps) {
    const { activeInn: runtimeActiveInn, activeCustomerName } = useAppRuntime();
    const activeInn = auth?.inn ?? runtimeActiveInn;
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
    const showPaymentCalendar = false;
    const [debugInfo, setDebugInfo] = useState<string>("");
    // Если отключены дашборды правом dashboard — оставляем только SLA.
    const showOnlySla = !hasDashboard;
    const WIDGET_1_FILTERS = !showOnlySla;
    const WIDGET_2_STRIP = !showOnlySla;
    const WIDGET_3_CHART = !showOnlySla;
    const WIDGET_4_SLA = true;
    const WIDGET_5_PAYMENT_CALENDAR = false;

    const {
        dateFilter,
        setDateFilter,
        customDateFrom,
        setCustomDateFrom,
        customDateTo,
        setCustomDateTo,
        selectedMonthForFilter,
        setSelectedMonthForFilter,
        selectedYearForFilter,
        setSelectedYearForFilter,
        selectedWeekForFilter,
        setSelectedWeekForFilter,
    } = usePersistedDateFilter();
    const sharedFiltersInit = initSharedFilterSets();
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [billStatusFilterSet, setBillStatusFilterSet] = useState<Set<SharedBillStatusKey>>(() => sharedFiltersInit.billStatusFilterSet);
    const [typeFilterSet, setTypeFilterSet] = useState<Set<TypeFilterKey>>(() => sharedFiltersInit.typeFilterSet);
    const [routeFilterSet, setRouteFilterSet] = useState<Set<RouteFilterKey>>(() => sharedFiltersInit.routeFilterSet);
    const [roleFilter, setRoleFilter] = useState<CargoRoleFilterKey>(() => loadDashboardRoleFilter());
    useEffect(() => {
        saveSharedVisibleListFilters({ billStatusFilterSet, typeFilterSet, routeFilterSet });
    }, [billStatusFilterSet, typeFilterSet, routeFilterSet]);
    useEffect(() => {
        if (!useServiceRequest) return;
        try { localStorage.setItem(DASH_ROLE_FILTER_KEY, roleFilter); } catch { /* ignore */ }
    }, [roleFilter, useServiceRequest]);
    useEffect(() => {
        if (roleFilter !== "all") setRoleFilter("all");
    }, [roleFilter]);
    const mainChartWrapRef = useRef<HTMLDivElement | null>(null);
    const [mainChartOuterWidthPx, setMainChartOuterWidthPx] = useState(800);
    const maChartWrapRef = useRef<HTMLDivElement | null>(null);
    const [maChartOuterWidthPx, setMaChartOuterWidthPx] = useState(800);
    
    // Chart type selector: деньги / вес / объём (при !showSums доступны только вес и объём)
    const [chartType, setChartType] = useState<'money' | 'paidWeight' | 'weight' | 'volume' | 'pieces'>(() => (showSums ? 'money' : 'paidWeight'));
    const [stripTab, setStripTab] = useState<'type' | 'sender' | 'receiver' | 'customer'>('type');
    const [deliveryStripTab, setDeliveryStripTab] = useState<'type' | 'sender' | 'receiver'>('type');
    /** true = показывать проценты, false = показывать в рублях/кг/м³/шт (по типу графика) */
    const [stripShowAsPercent, setStripShowAsPercent] = useState(true);
    const [deliveryStripShowAsPercent, setDeliveryStripShowAsPercent] = useState(true);
    /** Раскрытая строка в таблице «Перевозки вне SLA»: по клику показываем статусы в виде таблицы */
    const [expandedAgingBucket, setExpandedAgingBucket] = useState<string | null>(null);
    const [agingSortCol, setAgingSortCol] = useState<'number' | 'customer' | 'status' | 'shipmentStatus' | 'sum' | 'days'>('sum');
    const [agingSortAsc, setAgingSortAsc] = useState(false);
    /** Раскрытый сегмент RFM: при клике показываем список заказчиков */
    const [expandedRfmSegment, setExpandedRfmSegment] = useState<string | null>(null);
    /** Список заказчиков для виджета "Повторные клиенты" */
    const [repeatCustomersListMode, setRepeatCustomersListMode] = useState<'all' | 'repeat' | 'new' | null>(null);
    /** Выбранная строка воронки статусов для показа заказчиков */
    const [selectedFunnelStatusKey, setSelectedFunnelStatusKey] = useState<string | null>(null);
    /** Раскрытый заказчик в таблице «Заказчики по статусу» — показываем перевозки и даты */
    const [expandedFunnelCustomer, setExpandedFunnelCustomer] = useState<string | null>(null);
    /** Грузовой поток: таблица по клику на бейдж или плитку; по умолчанию свёрнута */
    const [cargoFlowTableExpanded, setCargoFlowTableExpanded] = useState(false);
    const [cargoFlowTableSelection, setCargoFlowTableSelection] = useState<CargoFlowTableSelection | null>(null);
    /** Комбинированный блок логистики: таблица заказчиков раскрывается только по клику на карточку. */
    const [selectedCombinedLogisticsKey, setSelectedCombinedLogisticsKey] = useState<CombinedLogisticsBucketKey | null>(null);
    const [expandedCombinedLogisticsCustomer, setExpandedCombinedLogisticsCustomer] = useState<string | null>(null);
    /** Сортировка таблицы «Платёжная дисциплина» */
    const [paymentDisciplineSortCol, setPaymentDisciplineSortCol] = useState<'name' | 'count' | 'paid' | 'unpaid' | 'paidRate'>('paidRate');
    const [paymentDisciplineSortAsc, setPaymentDisciplineSortAsc] = useState(true);
    const [maChartType, setMaChartType] = useState<'money' | 'paidWeight' | 'weight' | 'volume' | 'pieces'>('paidWeight');
    /** Виджет «Загрузка по дням недели»: приход (DatePrih) или факт выдачи/доставки */
    const [weekdayDistributionMode, setWeekdayDistributionMode] = useState<"received" | "issued">("received");
    /** Сортировка таблицы «Перевозки вне SLA»: колонка и направление */
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

    useEffect(() => {
        setExpandedCombinedLogisticsCustomer(null);
    }, [selectedCombinedLogisticsKey]);


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
                    const { ok, data: resData } = await sendMaxTestMessage(chatId, `🛠 ТЕСТ ИЗ ДАШБОРДА\nChatID: ${chatId}\nTime: ${new Date().toLocaleTimeString()}`);
                    logs.push(`Response status: ${ok ? 200 : "error"}`);
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

    const { apiDateRange, prevRange } = useListDateRange({
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
    });

    const [comparePeriodOverride, setComparePeriodOverride] = useState<{ dateFrom: string; dateTo: string } | null>(null);
    const [isComparePeriodDialogOpen, setIsComparePeriodDialogOpen] = useState(false);

    const comparePeriodRange = useMemo(
        () => comparePeriodOverride ?? prevRange,
        [comparePeriodOverride, prevRange],
    );

    useEffect(() => {
        setComparePeriodOverride(null);
    }, [
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter?.year,
        selectedMonthForFilter?.month,
        selectedYearForFilter,
        selectedWeekForFilter,
    ]);

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
    const {
        items: deliveryFactLookupItems,
        loading: deliveryFactLookupLoading,
    } = usePerevozki({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        dateField: "vr",
        useServiceRequest,
        inn: !useServiceRequest ? auth.inn : undefined,
        enabled: !!useServiceRequest,
    });
    const { items: prevPeriodItems, loading: prevPeriodLoading } = usePrevPeriodPerevozki({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        dateFromPrev: comparePeriodRange?.dateFrom ?? '',
        dateToPrev: comparePeriodRange?.dateTo ?? '',
        useServiceRequest: true,
        enabled: !!useServiceRequest && !!comparePeriodRange,
    });

    const filterInvoicesForHeaderCustomer = useCallback(
        (source: unknown[]) => {
            if (useServiceRequest) return source;
            return filterItemsForHeaderCustomer(source as Record<string, unknown>[], {
                activeInn: auth?.inn ?? runtimeActiveInn,
                activeCustomerName,
            });
        },
        [useServiceRequest, auth?.inn, runtimeActiveInn, activeCustomerName],
    );

    const calendarYear = new Date().getFullYear();
    const calendarDateFrom = `${calendarYear - 1}-01-01`;
    const calendarDateTo = new Date().toISOString().slice(0, 10);

    const unpaidMonitorDateFrom = useMemo(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return d.toISOString().slice(0, 10);
    }, []);

    /** Счета для монитора ЭДО — широкий период, не зависит от фильтра «Дата». */
    const monitorFetchEnabled = !!(auth?.login && auth?.password);
    const { items: monitorInvoiceItems, loading: monitorInvoicesLoading } = useInvoices({
        auth,
        dateFrom: calendarDateFrom,
        dateTo: calendarDateTo,
        activeInn: auth?.inn || undefined,
        useServiceRequest,
        enabled: monitorFetchEnabled,
    });
    const monitorInvoicesFiltered = useMemo(
        () => filterInvoicesForHeaderCustomer(monitorInvoiceItems),
        [monitorInvoiceItems, filterInvoicesForHeaderCustomer],
    );

    const edoMonitorInvoices = monitorInvoicesFiltered;

    /** Монитор задолженности — только последние 3 месяца. */
    const { items: unpaidPlanInvoiceItems, loading: unpaidPlanInvoicesLoading } = useInvoices({
        auth,
        dateFrom: unpaidMonitorDateFrom,
        dateTo: calendarDateTo,
        activeInn: auth?.inn || undefined,
        useServiceRequest,
        enabled: monitorFetchEnabled,
    });
    const unpaidPlanMonitorInvoices = useMemo(
        () => filterInvoicesForHeaderCustomer(unpaidPlanInvoiceItems),
        [unpaidPlanInvoiceItems, filterInvoicesForHeaderCustomer],
    );
    const { items: unpaidPlanCargoItems, loading: unpaidPlanCargoLoading } = usePerevozki({
        auth,
        dateFrom: unpaidMonitorDateFrom,
        dateTo: calendarDateTo,
        useServiceRequest,
        inn: !useServiceRequest ? auth?.inn : undefined,
        enabled: monitorFetchEnabled,
    });
    const unpaidPlanMonitorCargo = useMemo(() => {
        if (useServiceRequest) return unpaidPlanCargoItems;
        return filterCargoItemsForHeaderCustomer(unpaidPlanCargoItems, {
            activeInn: auth?.inn ?? runtimeActiveInn,
            activeCustomerName,
        });
    }, [unpaidPlanCargoItems, useServiceRequest, auth?.inn, runtimeActiveInn, activeCustomerName]);

    const { items: calendarInvoiceItems, mutate: mutateCalendarInvoices } = useInvoices({
        // Тяжёлый 3-летний диапазон не грузим на первом рендере дашборда.
        auth: null,
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
        fetchMyPaymentCalendar({ login: auth.login, password: auth.password })
            .then((data) => {
                if (cancelled) return;
                const map: Record<string, { days_to_pay: number; payment_weekdays: number[] }> = {};
                (data.items ?? []).forEach((row) => {
                    if (row?.inn == null) return;
                    const inn = String(row.inn).trim();
                    const days = Math.max(0, Number(row.days_to_pay) || 0);
                    const weekdays = Array.isArray(row.payment_weekdays) ? row.payment_weekdays.filter((d) => d >= 1 && d <= 5) : [];
                    map[inn] = { days_to_pay: days, payment_weekdays: weekdays };
                });
                setPaymentCalendarByInn(map);
                const ws: Record<string, WorkSchedule> = {};
                (data.work_schedules ?? []).forEach((r) => {
                    if (r?.inn) ws[r.inn.trim()] = { days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5], work_start: r.work_start || '09:00', work_end: r.work_end || '18:00' };
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => { if (!cancelled) setPaymentCalendarByInn({}); })
            .finally(() => { if (!cancelled) setPaymentCalendarLoading(false); });
        return () => { cancelled = true; };
    }, [showPaymentCalendar, auth?.login, auth?.password]);

    const filterCargoItems = useCallback(
        (source: CargoItem[]) => {
            const filtered = buildFilteredCargoItems({
                items: source,
                searchText: "",
                statusFilterSet: new Set<CargoStatusFilterKey>(),
                senderFilter: "",
                receiverFilter: "",
                transportFilter: "",
                useServiceRequest: !!useServiceRequest,
                billStatusFilterSet,
                typeFilterSet,
                routeFilterSet,
                lastMileFilter: "all",
                pickupLogisticsFilter: "all",
                roleFilter: "all",
                sortBy: null,
                sortOrder: "desc",
            });
            if (useServiceRequest) return filtered;
            return filterCargoItemsForHeaderCustomer(filtered, {
                activeInn: auth?.inn ?? runtimeActiveInn,
                activeCustomerName,
            });
        },
        [useServiceRequest, billStatusFilterSet, typeFilterSet, routeFilterSet, roleFilter, auth?.inn, runtimeActiveInn, activeCustomerName],
    );

    const filteredCargoItems = useMemo(() => filterCargoItems(items), [items, filterCargoItems]);

    const unpaidCount = useMemo(() => {
        return filteredCargoItems.filter((item) => getPaymentFilterKey(item.StateBill) === "unpaid").length;
    }, [filteredCargoItems]);

    const readyCount = useMemo(() => {
        return filteredCargoItems.filter((item) => getFilterKeyByStatus(item.State) === "ready").length;
    }, [filteredCargoItems]);

    const dashboardTotalItems = useMemo(() => filteredCargoItems, [filteredCargoItems]);
    const deliveryFactItems = useMemo(
        () => filterCargoItems(useServiceRequest ? deliveryFactLookupItems : items),
        [deliveryFactLookupItems, items, useServiceRequest, filterCargoItems],
    );
    
    /** Монитор SLA: жёстко только перевозки с фактом доставки в выбранном периоде (DateVr ∈ [dateFrom, dateTo]). */
    const slaMonitorFilteredItems = useMemo(() => {
        return deliveryFactItems.filter(
            (i) =>
                getFilterKeyByStatus(i.State) === 'delivered'
                && isDateInRange(String(i.DateVr ?? '').trim() || undefined, apiDateRange.dateFrom, apiDateRange.dateTo),
        );
    }, [deliveryFactItems, apiDateRange.dateFrom, apiDateRange.dateTo]);

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
    const getLastStatusDateKey = useCallback((item: CargoItem): string => {
        const candidates = [
            (item as any).StatusDate,
            (item as any).DateStatus,
            (item as any).DateState,
            (item as any).UpdatedAt,
            (item as any).updated_at,
            (item as any).ДатаСтатуса,
            (item as any).ДатаИзменения,
            (item as any).DateVr,
            (item as any).DatePrih,
        ];
        for (const candidate of candidates) {
            const parsed = parseDashboardDateOnly(candidate);
            if (parsed) {
                return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
            }
        }
        return '';
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

        dashboardTotalItems.forEach((item) => {
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
            total: dashboardTotalItems.length,
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
    }, [dashboardTotalItems, getEffectivePlannedDate]);

    useEffect(() => {
        if (!useServiceRequest || !auth?.login || !auth?.password || dashboardTotalItems.length === 0) return;
        const inns = [...new Set(dashboardTotalItems.map((i) => getInnFromCargo(i)).filter((x): x is string => !!x))];
        if (inns.length === 0) return;
        let cancelled = false;
        fetchCustomerWorkSchedules({ login: auth.login, password: auth.password }, inns)
            .then(({ items }) => {
                if (cancelled) return;
                const ws: Record<string, WorkSchedule> = {};
                items.forEach((r) => {
                    if (r?.inn) ws[r.inn.trim()] = { days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5], work_start: r.work_start || '09:00', work_end: r.work_end || '18:00' };
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => { /* ignore */ });
        return () => { cancelled = true; };
    }, [useServiceRequest, auth?.login, auth?.password, dashboardTotalItems]);

    const dashboardTotalPrevPeriodItems = useMemo(() => {
        if (!useServiceRequest || prevPeriodItems.length === 0) return [] as CargoItem[];
        return filterCargoItems(prevPeriodItems);
    }, [prevPeriodItems, useServiceRequest, filterCargoItems]);

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
    const lastMileTerminalLoad = useMemo(() => {
        const toNum = (value: unknown) => {
            const n = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        const makeBucket = (key: 'selfPickup' | 'delivery', label: string, color: string) => ({
            key,
            label,
            color,
            count: 0,
            w: 0,
            vol: 0,
            pw: 0,
            mest: 0,
            sum: 0,
        });
        const selfPickup = makeBucket('selfPickup', 'Самовывоз', '#2563eb');
        const delivery = makeBucket('delivery', 'Доставка', '#10b981');
        dashboardTotalItems.forEach((item) => {
            const bucket = cargoLastMileIsSelfPickup(item) ? selfPickup : delivery;
            bucket.count += 1;
            bucket.w += toNum(item.W);
            bucket.vol += toNum((item as any).Value ?? (item as any).Volume ?? (item as any).V);
            bucket.pw += toNum(item.PW);
            bucket.mest += toNum(item.Mest);
            bucket.sum += toNum(item.Sum);
        });
        const totals = {
            count: selfPickup.count + delivery.count,
            w: selfPickup.w + delivery.w,
            vol: selfPickup.vol + delivery.vol,
            pw: selfPickup.pw + delivery.pw,
            mest: selfPickup.mest + delivery.mest,
            sum: selfPickup.sum + delivery.sum,
        };
        return { rows: [selfPickup, delivery], totals };
    }, [dashboardTotalItems]);
    const pickupLogisticsLoad = useMemo(() => {
        const toNum = (value: unknown) => {
            const n = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        const makeBucket = (key: 'pickup' | 'terminalTo', label: string, color: string) => ({
            key,
            label,
            color,
            count: 0,
            w: 0,
            vol: 0,
            pw: 0,
            mest: 0,
            sum: 0,
        });
        const pickup = makeBucket('pickup', 'PickUP', '#f59e0b');
        const terminalTo = makeBucket('terminalTo', 'terminal-to', '#7c3aed');
        dashboardTotalItems.forEach((item) => {
            const bucket = cargoPickupLogisticsIsTerminalTo(item) ? terminalTo : pickup;
            bucket.count += 1;
            bucket.w += toNum(item.W);
            bucket.vol += toNum((item as any).Value ?? (item as any).Volume ?? (item as any).V);
            bucket.pw += toNum(item.PW);
            bucket.mest += toNum(item.Mest);
            bucket.sum += toNum(item.Sum);
        });
        const totals = {
            count: pickup.count + terminalTo.count,
            w: pickup.w + terminalTo.w,
            vol: pickup.vol + terminalTo.vol,
            pw: pickup.pw + terminalTo.pw,
            mest: pickup.mest + terminalTo.mest,
            sum: pickup.sum + terminalTo.sum,
        };
        return { rows: [pickup, terminalTo], totals };
    }, [dashboardTotalItems]);
    const pickupByLastMileLoad = useMemo(() => {
        const toNum = (value: unknown) => {
            const n = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        const makeBucket = (
            key: CombinedLogisticsBucketKey,
            label: string,
            color: string,
        ) => ({
            key,
            label,
            color,
            count: 0,
            w: 0,
            vol: 0,
            pw: 0,
            mest: 0,
            sum: 0,
            items: [] as CargoItem[],
        });
        const buckets = {
            terminalToSelfPickup: makeBucket('terminalToSelfPickup', 'terminal-to - самовывоз', '#2563eb'),
            terminalToDelivery: makeBucket('terminalToDelivery', 'terminal-to - доставка', '#7c3aed'),
            pickupSelfPickup: makeBucket('pickupSelfPickup', 'PickUP - самовывоз', '#f59e0b'),
            pickupDelivery: makeBucket('pickupDelivery', 'PickUP - доставка', '#10b981'),
        };
        dashboardTotalItems.forEach((item) => {
            const terminalTo = cargoPickupLogisticsIsTerminalTo(item);
            const selfPickup = cargoLastMileIsSelfPickup(item);
            const bucket = terminalTo
                ? (selfPickup ? buckets.terminalToSelfPickup : buckets.terminalToDelivery)
                : (selfPickup ? buckets.pickupSelfPickup : buckets.pickupDelivery);
            bucket.count += 1;
            bucket.w += toNum(item.W);
            bucket.vol += toNum((item as any).Value ?? (item as any).Volume ?? (item as any).V);
            bucket.pw += toNum(item.PW);
            bucket.mest += toNum(item.Mest);
            bucket.sum += toNum(item.Sum);
            bucket.items.push(item);
        });
        const rows = [buckets.terminalToSelfPickup, buckets.terminalToDelivery, buckets.pickupSelfPickup, buckets.pickupDelivery];
        const totals = rows.reduce(
            (acc, row) => ({
                count: acc.count + row.count,
                w: acc.w + row.w,
                vol: acc.vol + row.vol,
                pw: acc.pw + row.pw,
                mest: acc.mest + row.mest,
                sum: acc.sum + row.sum,
            }),
            { count: 0, w: 0, vol: 0, pw: 0, mest: 0, sum: 0 },
        );
        return { rows, totals };
    }, [dashboardTotalItems]);
    const selectedCombinedLogisticsBucket = useMemo(
        () => pickupByLastMileLoad.rows.find((row) => row.key === selectedCombinedLogisticsKey) ?? null,
        [pickupByLastMileLoad.rows, selectedCombinedLogisticsKey],
    );
    const combinedLogisticsCustomerRows = useMemo(() => {
        if (!selectedCombinedLogisticsBucket) return [];
        const toNum = (value: unknown) => {
            const n = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : Number(value ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        const byCustomer = new Map<string, {
            customer: string;
            items: CargoItem[];
            count: number;
            w: number;
            vol: number;
            pw: number;
            mest: number;
            sum: number;
        }>();
        selectedCombinedLogisticsBucket.items.forEach((item) => {
            const customer = String(item.Customer ?? (item as any).customer ?? "").trim() || "Без заказчика";
            const row = byCustomer.get(customer) ?? { customer, items: [], count: 0, w: 0, vol: 0, pw: 0, mest: 0, sum: 0 };
            row.items.push(item);
            row.count += 1;
            row.w += toNum(item.W);
            row.vol += toNum((item as any).Value ?? (item as any).Volume ?? (item as any).V);
            row.pw += toNum(item.PW);
            row.mest += toNum(item.Mest);
            row.sum += toNum(item.Sum);
            byCustomer.set(customer, row);
        });
        return [...byCustomer.values()].sort((a, b) => b.count - a.count || b.sum - a.sum || a.customer.localeCompare(b.customer, "ru"));
    }, [selectedCombinedLogisticsBucket]);
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
    const slaStats = useMemo(() => {
        const withSla = slaMonitorFilteredItems.map(i => getSlaInfo(i, workScheduleByInn)).filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
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
    }, [slaMonitorFilteredItems, workScheduleByInn]);

    const slaStatsByType = useMemo(() => {
        const autoItems = slaMonitorFilteredItems.filter(i => !isFerry(i));
        const ferryItems = slaMonitorFilteredItems.filter(i => isFerry(i));
        const calc = (arr: CargoItem[]) => {
            const withSla = arr.map(i => getSlaInfo(i, workScheduleByInn)).filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
            const total = withSla.length;
            const onTime = withSla.filter(s => s.onTime).length;
            const delayed = withSla.filter(s => !s.onTime);
            const avgDelay = delayed.length > 0 ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length) : 0;
            return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay };
        };
        return { auto: calc(autoItems), ferry: calc(ferryItems) };
    }, [slaMonitorFilteredItems, workScheduleByInn]);

    /** Перевозки вне SLA по типу (для таблицы в подробностях, только в служебном режиме) */
    const outOfSlaByType = useMemo(() => {
        const withSla = slaMonitorFilteredItems
            .map(i => ({ item: i, sla: getSlaInfo(i, workScheduleByInn) }))
            .filter((x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } => x.sla != null && !x.sla.onTime);
        return {
            auto: withSla.filter(x => !isFerry(x.item)),
            ferry: withSla.filter(x => isFerry(x.item)),
        };
    }, [slaMonitorFilteredItems, workScheduleByInn]);


    const slaTrend = useMemo(() => {
        const withSla = slaMonitorFilteredItems
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
    }, [slaMonitorFilteredItems, workScheduleByInn]);

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

    // ═══════ CLIENT ANALYTICS DATA ═══════

    const clientItems = useMemo(() => dashboardTotalItems, [dashboardTotalItems]);
    const getCustomerName = (item: any) => (item.Customer ?? item.customer ?? '').trim();
    const getItemDate = (item: any): Date | null => dateUtils.parseDateOnly(String(item.DatePrih ?? '').trim());
    const getItemSum = (item: any) => typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
    const getItemPw = (item: any) => typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);

    const cargoFlowDetailItems = useMemo(() => {
        if (!cargoFlowTableExpanded || !cargoFlowTableSelection) return [] as CargoItem[];
        const dateToKey = (date: Date): string =>
            `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayKey = dateToKey(today);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = dateToKey(tomorrow);
        const horizon = new Date(today);
        horizon.setDate(horizon.getDate() + 7);
        const horizonKey = dateToKey(horizon);
        const getPlannedKey = (item: CargoItem): string | null => {
            const planned = getEffectivePlannedDate(item);
            return planned ? dateToKey(planned) : null;
        };
        const isUndelivered = (item: CargoItem) => getFilterKeyByStatus(item.State) !== 'delivered';
        const sel = cargoFlowTableSelection;
        return dashboardTotalItems.filter((item) => {
            const plannedKey = getPlannedKey(item);
            if (sel.kind === 'tile') {
                if (!plannedKey) return false;
                return plannedKey === sel.dateKey;
            }
            switch (sel.badge) {
                case 'withoutPlan':
                    return !plannedKey;
                case 'withPlan':
                    return !!plannedKey;
                case 'overdue':
                    if (!plannedKey || !isUndelivered(item)) return false;
                    return plannedKey < todayKey;
                case 'dueToday':
                    if (!plannedKey || !isUndelivered(item)) return false;
                    return plannedKey === todayKey;
                case 'dueTomorrow':
                    if (!plannedKey || !isUndelivered(item)) return false;
                    return plannedKey === tomorrowKey;
                case 'dueNext7':
                    if (!plannedKey || !isUndelivered(item)) return false;
                    return plannedKey > tomorrowKey && plannedKey <= horizonKey;
                default:
                    return false;
            }
        });
    }, [dashboardTotalItems, cargoFlowTableExpanded, cargoFlowTableSelection, getEffectivePlannedDate]);

    const cargoFlowDetailSorted = useMemo(() => {
        return [...cargoFlowDetailItems].sort((a, b) => {
            const ka = getEffectivePlannedDate(a)?.getTime() ?? 0;
            const kb = getEffectivePlannedDate(b)?.getTime() ?? 0;
            if (ka !== kb) return ka - kb;
            return String(a.Number ?? '').localeCompare(String(b.Number ?? ''), 'ru');
        });
    }, [cargoFlowDetailItems, getEffectivePlannedDate]);

    const onCargoFlowPick = useCallback((sel: CargoFlowTableSelection) => {
        if (cargoFlowTableExpanded && cargoFlowSelectionEqual(cargoFlowTableSelection, sel)) {
            setCargoFlowTableExpanded(false);
            setCargoFlowTableSelection(null);
            return;
        }
        setCargoFlowTableSelection(sel);
        setCargoFlowTableExpanded(true);
    }, [cargoFlowTableExpanded, cargoFlowTableSelection]);

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
        activeInn,
        activeCustomerName,
        dashboardMotionEnabled,
        chartBarFillEnabled,
        normalizeTimelineErrorMessage,
        isVisibilityDeniedError,
        showPaymentCalendar,
        debugInfo,
        setDebugInfo,
        showOnlySla,
        WIDGET_1_FILTERS,
        WIDGET_2_STRIP,
        WIDGET_3_CHART,
        WIDGET_4_SLA,
        WIDGET_5_PAYMENT_CALENDAR,
        dateFilter,
        setDateFilter,
        customDateFrom,
        setCustomDateFrom,
        customDateTo,
        setCustomDateTo,
        selectedMonthForFilter,
        setSelectedMonthForFilter,
        selectedYearForFilter,
        setSelectedYearForFilter,
        selectedWeekForFilter,
        setSelectedWeekForFilter,
        sharedFiltersInit,
        isCustomModalOpen,
        setIsCustomModalOpen,
        billStatusFilterSet,
        setBillStatusFilterSet,
        typeFilterSet,
        setTypeFilterSet,
        routeFilterSet,
        setRouteFilterSet,
        roleFilter,
        setRoleFilter,
        mainChartWrapRef,
        mainChartOuterWidthPx,
        setMainChartOuterWidthPx,
        maChartWrapRef,
        maChartOuterWidthPx,
        setMaChartOuterWidthPx,
        chartType,
        setChartType,
        stripTab,
        setStripTab,
        deliveryStripTab,
        setDeliveryStripTab,
        stripShowAsPercent,
        setStripShowAsPercent,
        deliveryStripShowAsPercent,
        setDeliveryStripShowAsPercent,
        expandedAgingBucket,
        setExpandedAgingBucket,
        agingSortCol,
        setAgingSortCol,
        agingSortAsc,
        setAgingSortAsc,
        expandedRfmSegment,
        setExpandedRfmSegment,
        repeatCustomersListMode,
        setRepeatCustomersListMode,
        selectedFunnelStatusKey,
        setSelectedFunnelStatusKey,
        expandedFunnelCustomer,
        setExpandedFunnelCustomer,
        cargoFlowTableExpanded,
        setCargoFlowTableExpanded,
        cargoFlowTableSelection,
        setCargoFlowTableSelection,
        selectedCombinedLogisticsKey,
        setSelectedCombinedLogisticsKey,
        expandedCombinedLogisticsCustomer,
        setExpandedCombinedLogisticsCustomer,
        paymentDisciplineSortCol,
        setPaymentDisciplineSortCol,
        paymentDisciplineSortAsc,
        setPaymentDisciplineSortAsc,
        maChartType,
        setMaChartType,
        weekdayDistributionMode,
        setWeekdayDistributionMode,
        paymentCalendarByInn,
        setPaymentCalendarByInn,
        workScheduleByInn,
        setWorkScheduleByInn,
        paymentCalendarLoading,
        setPaymentCalendarLoading,
        paymentCalendarMonth,
        setPaymentCalendarMonth,
        paymentCalendarSelectedDate,
        setPaymentCalendarSelectedDate,
        heatmapMonth,
        setHeatmapMonth,
        heatmapRange,
        apiDateRange,
        prevRange,
        items,
        error,
        loading,
        auth,
        onClose,
        onOpenCargoFilters,
        showSums,
        useServiceRequest,
        hasAnalytics,
        hasDashboard,
        saasDashboardMotion,
        onOpenCargo,
        onOpenInvoice,
        onOpenDocumentsEdo,
        onOpenDocumentsInvoices,
        mutatePerevozki,
        mutateCalendarInvoices,
        filteredCargoItems,
        invoiceAging,
        paretoByCustomer,
        plannedByDate,
        comparePeriodOverride,
        setComparePeriodOverride,
        comparePeriodRange,
        isComparePeriodDialogOpen,
        setIsComparePeriodDialogOpen,
        prevPeriodLoading,
        monitorInvoicesLoading,
        unpaidPlanInvoicesLoading,
        unpaidPlanCargoLoading,
        edoMonitorInvoices,
        unpaidPlanMonitorInvoices,
        unpaidPlanMonitorCargo,
        filterCargoItems,
        dashboardTotalItems,
        deliveryFactItems,
        slaMonitorFilteredItems,
        cargoFlowByPlan,
        slaStats,
        slaStatsByType,
        outOfSlaByType,
        slaTrend,
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
        statusFunnel,
        statusFunnelCustomersTable,
        statusFunnelItemsByCustomer,
        loadHeatmap,
        movingAverage7,
        repeatCustomers,
        weekdayDistribution,
        weekdayDistributionLoading,
        clientItems,
        customerLtv,
        rfmSegments,
        paymentDiscipline,
        customerMargin,
        clientSeasonality,
        avgCheckTrend,
        deliveryPreferences,
        lastMileTerminalLoad,
        pickupLogisticsLoad,
        pickupByLastMileLoad,
        selectedCombinedLogisticsBucket,
        combinedLogisticsCustomerRows,
        cargoFlowDetailSorted,
        onCargoFlowPick,
        getItemSum,
        getEffectivePlannedDate,
        getLastStatusDateKey,
        chartData,
        stripTotals,
        deliveryStripTotals,
        deliveryStripDiagramByType,
        deliveryStripDiagramBySender,
        deliveryStripDiagramByReceiver,
    };


}
