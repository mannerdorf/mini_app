import { useCallback, useMemo } from "react";
import { useInvoices, usePerevozki } from "../../../hooks/useApi";
import { filterCargoItemsForHeaderCustomer, filterItemsForHeaderCustomer } from "../../../features/documents/lib/documentsPipeline";
import type { AuthData, CargoItem } from "../../../types";

export type UseDashboardMonitorsParams = {
    auth: AuthData;
    useServiceRequest: boolean;
    activeInn: string | undefined;
    runtimeActiveInn: string | undefined;
    activeCustomerName: string | undefined;
};

export function useDashboardMonitors({
    auth,
    useServiceRequest,
    activeInn,
    runtimeActiveInn,
    activeCustomerName,
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

    const calendarYear = new Date().getFullYear();
    const calendarDateFrom = `${calendarYear - 1}-01-01`;
    const calendarDateTo = new Date().toISOString().slice(0, 10);

    const unpaidMonitorDateFrom = useMemo(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return d.toISOString().slice(0, 10);
    }, []);

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

    const unpaidPlanMonitorCargo = useMemo((): CargoItem[] => {
        if (useServiceRequest) return unpaidPlanCargoItems;
        return filterCargoItemsForHeaderCustomer(unpaidPlanCargoItems, {
            activeInn: auth?.inn ?? runtimeActiveInn,
            activeCustomerName,
        });
    }, [unpaidPlanCargoItems, useServiceRequest, auth?.inn, runtimeActiveInn, activeCustomerName]);

    return {
        calendarDateFrom,
        calendarDateTo,
        filterInvoicesForHeaderCustomer,
        monitorInvoicesLoading,
        edoMonitorInvoices,
        unpaidPlanInvoicesLoading,
        unpaidPlanMonitorInvoices,
        unpaidPlanCargoLoading,
        unpaidPlanMonitorCargo,
    };
}

export type DashboardMonitorsState = ReturnType<typeof useDashboardMonitors>;
