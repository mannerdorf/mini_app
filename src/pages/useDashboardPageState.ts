/**
 * Dashboard page state hook.: виджеты перевозок, SLA, платёжный календарь, таймшит.
 */
import { useState, useEffect } from "react";
import { useReducedMotion } from "motion/react";
import type { WorkSchedule } from "../lib/slaWorkSchedule";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import { usePerevozki, usePerevozkiMulti, usePrevPeriodPerevozki } from "../hooks/useApi";
import { getWebApp, isMaxWebApp } from "../webApp";
import { sendMaxTestMessage } from "../api/client/dashboard";
import { fetchMyPaymentCalendar } from "../api/client/scheduling";
import { useDashboardFilters } from "../features/dashboard/hooks/useDashboardFilters";
import { useDashboardMonitors } from "../features/dashboard/hooks/useDashboardMonitors";
import { useDashboardCargoMetrics } from "../features/dashboard/hooks/useDashboardCargoMetrics";
import { useDashboardSlaMetrics } from "../features/dashboard/hooks/useDashboardSlaMetrics";
import { useDashboardLogisticsMetrics } from "../features/dashboard/hooks/useDashboardLogisticsMetrics";
import { useDashboardStripMetrics } from "../features/dashboard/hooks/useDashboardStripMetrics";
import { useDashboardInvoiceData } from "../features/dashboard/hooks/useDashboardInvoiceData";
import { useDashboardAnalytics } from "../features/dashboard/hooks/useDashboardAnalytics";
import { useDashboardMaChartLayout } from "../features/dashboard/hooks/useDashboardMaChartLayout";
import { useDashboardMainChartLayout } from "../features/dashboard/hooks/useDashboardMainChartLayout";
import { getLastStatusDateKey } from "../features/dashboard/hooks/dashboardCargoDateHelpers";
import { getCargoRoleSet } from "../lib/cargoUtils";
export type { DashboardPageProps } from "../features/dashboard/hooks/dashboardPageTypes";
import type { DashboardPageProps } from "../features/dashboard/hooks/dashboardPageTypes";

export type DashboardPageState = ReturnType<typeof useDashboardPageState>;

export function useDashboardPageState({
    auth,
    onClose,
    onOpenCargoFilters,
    showSums = true,
    useServiceRequest = false,
    hasAnalytics = false,
    hasDashboard = true,
    roleCustomer = true,
    roleSender = true,
    roleReceiver = true,
    saasDashboardMotion = false,
    onOpenCargo,
    onOpenInvoice,
    onOpenDocumentsEdo,
    onOpenDocumentsInvoices,
}: DashboardPageProps) {
    const { activeInn: runtimeActiveInn, activeCustomerName, showCustomerColumn } = useAppRuntime();
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
    const filters = useDashboardFilters({ showSums, useServiceRequest, hasDashboard });

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

    const { items, error, loading, mutate: mutatePerevozki } = usePerevozkiMulti({
        auth,
        dateFrom: filters.apiDateRange.dateFrom,
        dateTo: filters.apiDateRange.dateTo,
        useServiceRequest,
        inn: !useServiceRequest ? auth.inn : undefined,
        roleCustomer,
        roleSender,
        roleReceiver,
    });

    useEffect(() => {
        if (filters.chartType !== "money" || items.length === 0) return;
        const hasCustomerRole = items.some((item) => getCargoRoleSet(item).has("Customer"));
        if (!hasCustomerRole) filters.setChartType("paidWeight");
    }, [items, filters.chartType, filters.setChartType]);

    const {
        items: deliveryFactLookupItems,
        loading: deliveryFactLookupLoading,
    } = usePerevozki({
        auth,
        dateFrom: filters.apiDateRange.dateFrom,
        dateTo: filters.apiDateRange.dateTo,
        dateField: "vr",
        useServiceRequest,
        inn: !useServiceRequest ? auth.inn : undefined,
        enabled: !!useServiceRequest,
    });
    const { items: prevPeriodItems, loading: prevPeriodLoading } = usePrevPeriodPerevozki({
        auth,
        dateFrom: filters.apiDateRange.dateFrom,
        dateTo: filters.apiDateRange.dateTo,
        dateFromPrev: filters.comparePeriodRange?.dateFrom ?? "",
        dateToPrev: filters.comparePeriodRange?.dateTo ?? "",
        useServiceRequest: true,
        enabled: !!useServiceRequest && !!filters.comparePeriodRange,
    });

    const monitors = useDashboardMonitors({
        auth,
        useServiceRequest,
        activeInn,
        runtimeActiveInn,
        activeCustomerName,
        apiDateRange: filters.apiDateRange,
        invoicesFetchEnabled: !loading,
    });

    const { calendarInvoiceItems, mutateCalendarInvoices } = monitors;

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

    const cargoMetrics = useDashboardCargoMetrics({
        auth,
        useServiceRequest,
        runtimeActiveInn,
        activeCustomerName,
        billStatusFilterSet: filters.billStatusFilterSet,
        typeFilterSet: filters.typeFilterSet,
        routeFilterSet: filters.routeFilterSet,
        roleFilter: filters.roleFilter,
        apiDateRange: filters.apiDateRange,
        items,
        deliveryFactLookupItems,
        prevPeriodItems,
        setWorkScheduleByInn,
        cargoFlowTableExpanded: filters.cargoFlowTableExpanded,
        cargoFlowTableSelection: filters.cargoFlowTableSelection,
        setCargoFlowTableExpanded: filters.setCargoFlowTableExpanded,
        setCargoFlowTableSelection: filters.setCargoFlowTableSelection,
    });

    const slaMetrics = useDashboardSlaMetrics({
        slaMonitorFilteredItems: cargoMetrics.slaMonitorFilteredItems,
        workScheduleByInn,
    });

    const logisticsMetrics = useDashboardLogisticsMetrics({
        dashboardTotalItems: cargoMetrics.dashboardTotalItems,
        selectedCombinedLogisticsKey: filters.selectedCombinedLogisticsKey,
    });

    const invoiceData = useDashboardInvoiceData({
        calendarInvoiceItems,
        paymentCalendarByInn,
        apiDateRange: filters.apiDateRange,
        authInn: auth?.inn,
        items,
        useServiceRequest,
    });

    const stripMetrics = useDashboardStripMetrics({
        dashboardTotalItems: cargoMetrics.dashboardTotalItems,
        dashboardTotalPrevPeriodItems: cargoMetrics.dashboardTotalPrevPeriodItems,
        deliveryFactItems: cargoMetrics.deliveryFactItems,
        chartType: filters.chartType,
        stripTab: filters.stripTab,
        showSums,
        useServiceRequest,
        apiDateRange: filters.apiDateRange,
    });

    useDashboardMainChartLayout({
        widget3Chart: filters.WIDGET_3_CHART,
        showOnlySla: filters.showOnlySla,
        showSums,
        loading,
        error,
        chartDataLength: stripMetrics.chartData.length,
        chartType: filters.chartType,
        mainChartWrapRef: filters.mainChartWrapRef,
        setMainChartOuterWidthPx: filters.setMainChartOuterWidthPx,
    });

    const analytics = useDashboardAnalytics({
        useServiceRequest,
        dashboardTotalItems: cargoMetrics.dashboardTotalItems,
        dashboardTotalPrevPeriodItems: cargoMetrics.dashboardTotalPrevPeriodItems,
        deliveryFactItems: cargoMetrics.deliveryFactItems,
        apiDateRange: filters.apiDateRange,
        heatmapMonth: filters.heatmapMonth,
        chartData: stripMetrics.chartData,
        maChartType: filters.maChartType,
        weekdayDistributionMode: filters.weekdayDistributionMode,
        loading,
        deliveryFactLookupLoading,
    });

    useDashboardMaChartLayout({
        useServiceRequest,
        loading,
        error,
        showOnlySla: filters.showOnlySla,
        movingAverage7: analytics.movingAverage7,
        maChartType: filters.maChartType,
        maChartWrapRef: filters.maChartWrapRef,
        setMaChartOuterWidthPx: filters.setMaChartOuterWidthPx,
    });

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
        ...filters,
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
        prevPeriodLoading,
        showCustomerColumn,
        getLastStatusDateKey,
        ...monitors,
        ...cargoMetrics,
        ...slaMetrics,
        ...logisticsMetrics,
        ...invoiceData,
        ...stripMetrics,
        ...analytics,
    };
}
