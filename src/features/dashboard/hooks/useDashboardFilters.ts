import { useState, useEffect, useMemo, useRef } from "react";
import * as dateUtils from "../../../lib/dateUtils";
import {
    initSharedFilterSets,
    saveSharedVisibleListFilters,
    type CargoStatusFilterKey,
    type RouteFilterKey,
    type SharedBillStatusKey,
    type TypeFilterKey,
} from "../../../lib/sharedListFilters";
import { HAULZ_PULL_REFRESH_EVENT } from "../../../lib/pullRefreshEvents";
import { useListDateRange, usePersistedDateFilter } from "../../../features/listWorkspace";
import { loadDashboardRoleFilter, DASH_ROLE_FILTER_KEY } from "../../../features/dashboard";
import type { CargoRoleFilterKey } from "../../../lib/cargoUtils";
import type {
    CargoFlowTableSelection,
    CombinedLogisticsBucketKey,
} from "../../../features/dashboard";

export type UseDashboardFiltersParams = {
    showSums: boolean;
    useServiceRequest: boolean;
    hasDashboard: boolean;
};

export function useDashboardFilters({
    showSums,
    useServiceRequest,
    hasDashboard,
}: UseDashboardFiltersParams) {
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
    const [billStatusFilterSet, setBillStatusFilterSet] = useState<Set<SharedBillStatusKey>>(
        () => sharedFiltersInit.billStatusFilterSet,
    );
    const [typeFilterSet, setTypeFilterSet] = useState<Set<TypeFilterKey>>(
        () => sharedFiltersInit.typeFilterSet,
    );
    const [routeFilterSet, setRouteFilterSet] = useState<Set<RouteFilterKey>>(
        () => sharedFiltersInit.routeFilterSet,
    );
    const [roleFilter, setRoleFilter] = useState<CargoRoleFilterKey>(() => loadDashboardRoleFilter());

    useEffect(() => {
        saveSharedVisibleListFilters({ billStatusFilterSet, typeFilterSet, routeFilterSet });
    }, [billStatusFilterSet, typeFilterSet, routeFilterSet]);

    useEffect(() => {
        const reloadSharedFilters = () => {
            const init = initSharedFilterSets();
            setBillStatusFilterSet(init.billStatusFilterSet);
            setTypeFilterSet(init.typeFilterSet);
            setRouteFilterSet(init.routeFilterSet);
        };
        window.addEventListener(HAULZ_PULL_REFRESH_EVENT, reloadSharedFilters);
        return () => window.removeEventListener(HAULZ_PULL_REFRESH_EVENT, reloadSharedFilters);
    }, []);

    useEffect(() => {
        if (!useServiceRequest) return;
        try {
            localStorage.setItem(DASH_ROLE_FILTER_KEY, roleFilter);
        } catch {
            /* ignore */
        }
    }, [roleFilter, useServiceRequest]);

    useEffect(() => {
        if (roleFilter !== "all") setRoleFilter("all");
    }, [roleFilter]);

    const mainChartWrapRef = useRef<HTMLDivElement | null>(null);
    const [mainChartOuterWidthPx, setMainChartOuterWidthPx] = useState(800);
    const maChartWrapRef = useRef<HTMLDivElement | null>(null);
    const [maChartOuterWidthPx, setMaChartOuterWidthPx] = useState(800);

    const [chartType, setChartType] = useState<"money" | "paidWeight" | "weight" | "volume" | "pieces">(() =>
        showSums ? "money" : "paidWeight",
    );
    const [stripTab, setStripTab] = useState<"type" | "sender" | "receiver" | "customer">("type");
    const [deliveryStripTab, setDeliveryStripTab] = useState<"type" | "sender" | "receiver">("type");
    const [stripShowAsPercent, setStripShowAsPercent] = useState(true);
    const [deliveryStripShowAsPercent, setDeliveryStripShowAsPercent] = useState(true);
    const [expandedAgingBucket, setExpandedAgingBucket] = useState<string | null>(null);
    const [agingSortCol, setAgingSortCol] = useState<
        "number" | "customer" | "status" | "shipmentStatus" | "sum" | "days"
    >("sum");
    const [agingSortAsc, setAgingSortAsc] = useState(false);
    const [expandedRfmSegment, setExpandedRfmSegment] = useState<string | null>(null);
    const [repeatCustomersListMode, setRepeatCustomersListMode] = useState<"all" | "repeat" | "new" | null>(null);
    const [selectedFunnelStatusKey, setSelectedFunnelStatusKey] = useState<string | null>(null);
    const [expandedFunnelCustomer, setExpandedFunnelCustomer] = useState<string | null>(null);
    const [cargoFlowTableExpanded, setCargoFlowTableExpanded] = useState(false);
    const [cargoFlowTableSelection, setCargoFlowTableSelection] = useState<CargoFlowTableSelection | null>(null);
    const [selectedCombinedLogisticsKey, setSelectedCombinedLogisticsKey] =
        useState<CombinedLogisticsBucketKey | null>(null);
    const [expandedCombinedLogisticsCustomer, setExpandedCombinedLogisticsCustomer] = useState<string | null>(null);
    const [paymentDisciplineSortCol, setPaymentDisciplineSortCol] = useState<
        "name" | "count" | "paid" | "unpaid" | "paidRate"
    >("paidRate");
    const [paymentDisciplineSortAsc, setPaymentDisciplineSortAsc] = useState(true);
    const [maChartType, setMaChartType] = useState<"money" | "paidWeight" | "weight" | "volume" | "pieces">(
        "paidWeight",
    );
    const [weekdayDistributionMode, setWeekdayDistributionMode] = useState<"received" | "issued">("received");
    const [heatmapMonth, setHeatmapMonth] = useState<{ year: number; month: number }>(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() + 1 };
    });

    useEffect(() => {
        if (!showSums && chartType === "money") setChartType("paidWeight");
    }, [showSums, chartType]);

    useEffect(() => {
        if (!showSums) {
            setStripShowAsPercent(true);
            setDeliveryStripShowAsPercent(true);
        }
    }, [showSums]);

    useEffect(() => {
        if (!useServiceRequest && stripTab === "customer") setStripTab("type");
    }, [useServiceRequest, stripTab]);

    useEffect(() => {
        setExpandedCombinedLogisticsCustomer(null);
    }, [selectedCombinedLogisticsKey]);

    const { apiDateRange, prevRange } = useListDateRange({
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
    });

    const [comparePeriodOverride, setComparePeriodOverride] = useState<{ dateFrom: string; dateTo: string } | null>(
        null,
    );
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

    return {
        sharedFiltersInit,
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
        heatmapMonth,
        setHeatmapMonth,
        apiDateRange,
        prevRange,
        comparePeriodOverride,
        setComparePeriodOverride,
        isComparePeriodDialogOpen,
        setIsComparePeriodDialogOpen,
        comparePeriodRange,
    };
}

export type DashboardFiltersState = ReturnType<typeof useDashboardFilters>;
