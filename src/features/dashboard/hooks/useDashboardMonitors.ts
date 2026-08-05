import { useCallback, useMemo } from "react";
import { useInvoices, usePerevozki } from "../../../hooks/useApi";
import { filterCargoItemsForHeaderCustomer, filterItemsForHeaderCustomer } from "../../../features/documents/lib/documentsPipeline";
import { parseDateOnly } from "../../../lib/dateUtils";
import type { AuthData, CargoItem } from "../../../types";

/** Монитор задолженности всегда смотрит 3 месяца назад от сегодня — независимо от фильтра дашборда. */
const UNPAID_MONITOR_MONTHS = 3;

function invoiceDocDateKey(inv: Record<string, unknown>): string {
    const raw = String(inv?.DateDoc ?? inv?.Date ?? inv?.date ?? inv?.dateDoc ?? inv?.Дата ?? "").trim();
    if (!raw) return "";
    const parsed = parseDateOnly(raw);
    if (!parsed) return "";
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function filterInvoicesInRange(source: unknown[], dateFrom: string, dateTo: string): unknown[] {
    if (!dateFrom && !dateTo) return source;
    return source.filter((inv) => {
        const key = invoiceDocDateKey(inv as Record<string, unknown>);
        if (!key) return false;
        if (dateFrom && key < dateFrom) return false;
        if (dateTo && key > dateTo) return false;
        return true;
    });
}

function filterInvoicesOnOrAfter(source: unknown[], dateFrom: string): unknown[] {
    if (!dateFrom) return source;
    return source.filter((inv) => {
        const key = invoiceDocDateKey(inv as Record<string, unknown>);
        return key && key >= dateFrom;
    });
}

function minDateKey(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
}

function maxDateKey(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
}

export type UseDashboardMonitorsParams = {
    auth: AuthData;
    useServiceRequest: boolean;
    activeInn: string | undefined;
    runtimeActiveInn: string | undefined;
    activeCustomerName: string | undefined;
    apiDateRange: { dateFrom: string; dateTo: string };
    /** false — не грузить счета, пока основной блок перевозок ещё грузится. */
    invoicesFetchEnabled?: boolean;
};

export function useDashboardMonitors({
    auth,
    useServiceRequest,
    activeInn,
    runtimeActiveInn,
    activeCustomerName,
    apiDateRange,
    invoicesFetchEnabled = true,
}: UseDashboardMonitorsParams) {
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

    const todayKey = new Date().toISOString().slice(0, 10);

    const unpaidMonitorDateFrom = useMemo(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - UNPAID_MONITOR_MONTHS);
        return d.toISOString().slice(0, 10);
    }, []);

    /** Один запрос: объединение периода фильтра и окна монитора задолженности (3 мес.). */
    const invoiceFetchDateFrom = useMemo(
        () => minDateKey(apiDateRange.dateFrom, unpaidMonitorDateFrom),
        [apiDateRange.dateFrom, unpaidMonitorDateFrom],
    );
    const invoiceFetchDateTo = useMemo(
        () => maxDateKey(apiDateRange.dateTo, todayKey),
        [apiDateRange.dateTo, todayKey],
    );

    const monitorFetchEnabled = !!(auth?.login && auth?.password) && invoicesFetchEnabled;

    const {
        items: monitorInvoiceItems,
        loading: monitorInvoicesLoading,
        mutate: mutateCalendarInvoices,
    } = useInvoices({
        auth,
        dateFrom: invoiceFetchDateFrom,
        dateTo: invoiceFetchDateTo,
        activeInn: auth?.inn || undefined,
        useServiceRequest,
        enabled: monitorFetchEnabled,
    });

    const monitorInvoicesFiltered = useMemo(
        () => filterInvoicesForHeaderCustomer(monitorInvoiceItems),
        [monitorInvoiceItems, filterInvoicesForHeaderCustomer],
    );

    /** ЭДО и aging — строго в рамках выбранного фильтра дашборда. */
    const edoMonitorInvoices = useMemo(
        () => filterInvoicesInRange(
            monitorInvoicesFiltered,
            apiDateRange.dateFrom,
            apiDateRange.dateTo,
        ),
        [monitorInvoicesFiltered, apiDateRange.dateFrom, apiDateRange.dateTo],
    );

    const calendarInvoiceItems = edoMonitorInvoices;

    const unpaidPlanMonitorInvoices = useMemo(
        () => filterInvoicesOnOrAfter(monitorInvoicesFiltered, unpaidMonitorDateFrom),
        [monitorInvoicesFiltered, unpaidMonitorDateFrom],
    );

    const { items: unpaidPlanCargoItems, loading: unpaidPlanCargoLoading } = usePerevozki({
        auth,
        dateFrom: unpaidMonitorDateFrom,
        dateTo: todayKey,
        useServiceRequest,
        inn: !useServiceRequest ? auth?.inn : undefined,
        enabled: monitorFetchEnabled,
    });

    const unpaidPlanMonitorCargo = useMemo((): CargoItem[] => {
        if (useServiceRequest) return unpaidPlanCargoItems;
        return filterCargoItemsForHeaderCustomer(unpaidPlanCargoItems, {
            activeInn: auth?.inn ?? runtimeActiveInn,
            activeCustomerName,
        });
    }, [unpaidPlanCargoItems, useServiceRequest, auth?.inn, runtimeActiveInn, activeCustomerName]);

    return {
        calendarDateFrom: apiDateRange.dateFrom,
        calendarDateTo: apiDateRange.dateTo,
        calendarInvoiceItems,
        mutateCalendarInvoices,
        filterInvoicesForHeaderCustomer,
        monitorInvoicesLoading,
        edoMonitorInvoices,
        unpaidPlanInvoicesLoading: monitorInvoicesLoading,
        unpaidPlanMonitorInvoices,
        unpaidPlanCargoLoading,
        unpaidPlanMonitorCargo,
    };
}

export type DashboardMonitorsState = ReturnType<typeof useDashboardMonitors>;
