import { useCallback, useEffect, useMemo, useState } from "react";
import { useInvoices, usePerevozki } from "../../../hooks/useApi";
import { filterCargoItemsForHeaderCustomer, filterItemsForHeaderCustomer } from "../../../features/documents/lib/documentsPipeline";
import type { AuthData, CargoItem } from "../types";

/** Временно off — запросы /api/invoices перегружают VPS. Включить после стабилизации. */
export const DASHBOARD_INVOICE_MONITORS_ENABLED = false;

/** Монитор задолженности — окно 3 месяца. */
const UNPAID_MONITOR_MONTHS = 3;

/** Задержка второго запроса счетов, чтобы не блокировать perevozki/sendings. */
const DEBT_INVOICES_DEFER_MS = 4000;

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

    const monitorFetchEnabled =
        DASHBOARD_INVOICE_MONITORS_ENABLED && !!(auth?.login && auth?.password) && invoicesFetchEnabled;

    const [debtInvoicesEnabled, setDebtInvoicesEnabled] = useState(false);
    useEffect(() => {
        if (!monitorFetchEnabled) {
            setDebtInvoicesEnabled(false);
            return;
        }
        const timer = window.setTimeout(() => setDebtInvoicesEnabled(true), DEBT_INVOICES_DEFER_MS);
        return () => window.clearTimeout(timer);
    }, [monitorFetchEnabled, apiDateRange.dateFrom, apiDateRange.dateTo]);

    /** ЭДО — только период фильтра дашборда, облегчённый ответ. */
    const {
        items: edoInvoiceItems,
        loading: edoInvoicesLoading,
        mutate: mutateEdoInvoices,
    } = useInvoices({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        activeInn: auth?.inn || undefined,
        useServiceRequest,
        monitor: "edo",
        enabled: monitorFetchEnabled,
    });

    /** Монитор задолженности — 3 мес., только неоплаченные; стартует с задержкой. */
    const {
        items: debtInvoiceItems,
        loading: debtInvoicesLoading,
        mutate: mutateDebtInvoices,
    } = useInvoices({
        auth,
        dateFrom: unpaidMonitorDateFrom,
        dateTo: todayKey,
        activeInn: auth?.inn || undefined,
        useServiceRequest,
        monitor: "debt",
        unpaidOnly: true,
        enabled: monitorFetchEnabled && debtInvoicesEnabled,
    });

    const mutateCalendarInvoices = useCallback(
        (...args: Parameters<typeof mutateEdoInvoices>) => {
            void mutateEdoInvoices(...args);
            void mutateDebtInvoices(...args);
        },
        [mutateEdoInvoices, mutateDebtInvoices],
    );

    const edoMonitorInvoices = useMemo(
        () => filterInvoicesForHeaderCustomer(edoInvoiceItems),
        [edoInvoiceItems, filterInvoicesForHeaderCustomer],
    );

    const calendarInvoiceItems = edoMonitorInvoices;

    const unpaidPlanMonitorInvoices = useMemo(
        () => filterInvoicesForHeaderCustomer(debtInvoiceItems),
        [debtInvoiceItems, filterInvoicesForHeaderCustomer],
    );

    const { items: unpaidPlanCargoItems, loading: unpaidPlanCargoLoading } = usePerevozki({
        auth,
        dateFrom: unpaidMonitorDateFrom,
        dateTo: todayKey,
        useServiceRequest,
        inn: !useServiceRequest ? auth?.inn : undefined,
        enabled: monitorFetchEnabled && debtInvoicesEnabled,
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
        monitorInvoicesLoading: edoInvoicesLoading,
        edoMonitorInvoices,
        unpaidPlanInvoicesLoading: debtInvoicesLoading,
        unpaidPlanMonitorInvoices,
        unpaidPlanCargoLoading,
        unpaidPlanMonitorCargo,
    };
}

export type DashboardMonitorsState = ReturnType<typeof useDashboardMonitors>;
