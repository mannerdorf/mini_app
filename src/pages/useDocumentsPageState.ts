import { useState, useMemo } from "react";
import { useReducedMotion } from "motion/react";
import { useDocFavorites } from "../features/documents/catalogs";
import { useDocumentsCargoContext } from "../features/documents/hooks/useDocumentsCargoContext";
import { useDocumentsPageNavigation } from "../features/documents/hooks/useDocumentsPageNavigation";
import { useDocumentsPageFilters } from "../features/documents/hooks/useDocumentsPageFilters";
import { useDocumentsCatalogs } from "../features/documents/hooks/useDocumentsCatalogs";
import { useDocumentsUniqueFilterOptions } from "../features/documents/hooks/useDocumentsUniqueFilterOptions";
import { usePersistedDateFilter } from "../features/listWorkspace";
import type { AccountPermissions, AuthData, CargoItem } from "../types";
import { useDocumentsDateRange } from "./useDocumentsDateRange";
import { useDocumentsDataLoad } from "./useDocumentsDataLoad";
import { useDocumentsSendingsWiring } from "./useDocumentsSendingsWiring";
import { useDocumentsToolbarWiring } from "./useDocumentsToolbarWiring";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import { cargoModeSwitchMotion } from "./cargoMotion";

export type DocumentsPageProps = {
    auth: AuthData;
    documentsServiceSaasUi?: boolean;
    useServiceRequest?: boolean;
    activeInn?: string;
    searchText?: string;
    onOpenCargo?: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
    onOpenAisWithMmsi?: (mmsi: string) => void;
    onOpenChat?: (context?: string) => void | Promise<void>;
    permissions?: AccountPermissions | null;
    showSums?: boolean;
    hasAnalytics?: boolean;
    isSuperAdmin?: boolean;
};

export function useDocumentsPageState({
    auth,
    documentsServiceSaasUi = false,
    useServiceRequest,
    activeInn,
    searchText,
    onOpenCargo,
    onOpenAisWithMmsi,
    permissions,
    showSums = true,
    hasAnalytics = false,
    isSuperAdmin = false,
}: DocumentsPageProps) {
    const runtime = useAppRuntime();
    const effectiveServiceMode = useServiceRequest ?? runtime.useServiceRequest;
    const effectiveActiveInn = activeInn ?? runtime.activeInn;
    const effectiveSearchText = searchText ?? runtime.searchText;
    const showCustomerColumn = runtime.showCustomerColumn;
    const activeCustomerName = runtime.activeCustomerName;
    const docsMotionEnabled = useReducedMotion() !== true;

    const dateFilterState = usePersistedDateFilter();
    const navigation = useDocumentsPageNavigation({
        permissions,
        showCustomerColumn,
        effectiveServiceMode,
    });
    const {
        docSection,
        setDocSection,
        allowedDocSections,
        tableModeByCustomer,
        setTableModeByCustomer,
        tableModeGroupedByCustomer,
        tableModeFlatDirect,
        tableModeEffective,
        documentsOrderFormOpen,
        setDocumentsOrderFormOpenPersist,
        serviceModeForCurrentDocSection,
    } = navigation;

    const groupedCustomerTableColSpan = useMemo(
        () => (showCustomerColumn ? 1 : 0) + (showSums ? 1 : 0) + 1,
        [showCustomerColumn, showSums],
    );
    const [expandedTableCustomer, setExpandedTableCustomer] = useState<string | null>(null);

    const filters = useDocumentsPageFilters(effectiveServiceMode);
    const { apiDateRange, perevozkiDateRange } = useDocumentsDateRange({
        dateFilter: dateFilterState.dateFilter,
        customDateFrom: dateFilterState.customDateFrom,
        customDateTo: dateFilterState.customDateTo,
        selectedMonthForFilter: dateFilterState.selectedMonthForFilter,
        selectedYearForFilter: dateFilterState.selectedYearForFilter,
        selectedWeekForFilter: dateFilterState.selectedWeekForFilter,
    });

    const dataLoad = useDocumentsDataLoad({
        auth,
        activeInn: effectiveActiveInn,
        useServiceRequest: serviceModeForCurrentDocSection,
        apiDateRange,
        perevozkiDateRange,
        docSection,
    });

    const cargo = useDocumentsCargoContext({
        auth,
        effectiveActiveInn,
        serviceModeForCurrentDocSection,
        transportFilter: filters.transportFilter,
        apiDateRange,
        perevozkiDateRange,
        perevozkiItemsBase: dataLoad.perevozkiItems,
        sendingsItems: dataLoad.sendingsItems || [],
    });

    const { isDocFavorite, toggleDocFavorite } = useDocFavorites();

    const catalogs = useDocumentsCatalogs({
        docSection,
        setDocSection,
        allowedDocSections,
        auth,
        items: dataLoad.items,
        actsItems: dataLoad.actsItems,
        ordersItems: dataLoad.ordersItems,
        effectiveActiveInn,
        effectiveServiceMode,
        effectiveSearchText,
        apiDateRange,
        cargo,
        filters,
        dateFilterState,
        tableModeGroupedByCustomer,
        expandedTableCustomer,
        setExpandedTableCustomer,
    });

    const { uniqueCustomers, uniqueEdoStatuses } = useDocumentsUniqueFilterOptions({
        docSection,
        items: dataLoad.items,
        actsItems: dataLoad.actsItems,
        dogovorsList: catalogs.dogovorsCatalog.dogovorsList,
        sverkiList: catalogs.sverkiCatalog.sverkiList,
    });

    const sendingsPage = useDocumentsSendingsWiring({
        active: docSection === "Отправки",
        auth,
        effectiveActiveInn,
        effectiveServiceMode,
        showCustomerColumn,
        showSums,
        hasAnalytics,
        isSuperAdmin,
        permissions,
        sendingsItems: dataLoad.sendingsItems || [],
        sendingsLoading: dataLoad.sendingsLoading,
        sendingsError: dataLoad.sendingsError,
        perevozkiItems: cargo.perevozkiItems || [],
        cargo,
        apiDateRange,
        filters,
        effectiveSearchText,
        tableModeEffective,
        docsMotionEnabled,
        onOpenCargo,
        onOpenAisWithMmsi,
        dateFilter: dateFilterState.dateFilter,
        customDateFrom: dateFilterState.customDateFrom,
        customDateTo: dateFilterState.customDateTo,
        selectedMonthForFilter: dateFilterState.selectedMonthForFilter,
        selectedYearForFilter: dateFilterState.selectedYearForFilter,
        selectedWeekForFilter: dateFilterState.selectedWeekForFilter,
    });

    const {
        toolbarProps,
        closeDocumentsToolbarDropdownsExceptSendings,
        closeDocumentsToolbarDropdownsForTransport,
    } = useDocumentsToolbarWiring({
        filters,
        catalogs,
        uniqueCustomers,
        uniqueEdoStatuses,
        sendingsTransportOptions: sendingsPage.transportOptionsCurrentSection,
        apiDateRange,
        dateFilterState,
        effectiveServiceMode,
        loading: dataLoad.loading,
        error: dataLoad.error,
        actsLoading: dataLoad.actsLoading,
        actsError: dataLoad.actsError,
        showSums,
        documentsServiceSaasUi,
        tableModeFlatDirect,
        docsMotionEnabled,
        auth,
        effectiveActiveInn,
        onNewOrder: () => setDocumentsOrderFormOpenPersist(true),
        onOpenClaimsCreate: () => catalogs.claimsCatalog.openClaimsCreateModal(),
        onOpenSverkiOrder: catalogs.sverkiCatalog.openSverkiOrderModal,
        sverkiOrderDisabled: !effectiveActiveInn || !auth?.login || !auth?.password,
    });

    return {
        auth,
        documentsServiceSaasUi,
        docSection,
        setDocSection,
        allowedDocSections,
        effectiveServiceMode,
        effectiveActiveInn,
        effectiveSearchText,
        activeCustomerName,
        apiDateRange,
        toolbarProps,
        closeDocumentsToolbarDropdownsExceptSendings,
        closeDocumentsToolbarDropdownsForTransport,
        tableModeByCustomer,
        setTableModeByCustomer,
        tableModeGroupedByCustomer,
        tableModeFlatDirect,
        tableModeEffective,
        docsMotionEnabled,
        showCustomerColumn,
        showSums,
        hasAnalytics,
        groupedCustomerTableColSpan,
        loading: dataLoad.loading,
        error: dataLoad.error,
        perevozkiLoading: dataLoad.perevozkiLoading,
        actsLoading: dataLoad.actsLoading,
        actsError: dataLoad.actsError,
        ordersLoading: dataLoad.ordersLoading,
        ordersError: dataLoad.ordersError,
        mutateInvoices: dataLoad.mutateInvoices,
        mutatePerevozki: dataLoad.mutatePerevozki,
        mutateActs: dataLoad.mutateActs,
        mutateOrders: dataLoad.mutateOrders,
        mutateSendings: dataLoad.mutateSendings,
        items: dataLoad.items,
        invoicesCatalog: catalogs.invoicesCatalog,
        actsCatalog: catalogs.actsCatalog,
        edoCatalog: catalogs.edoCatalog,
        ordersCatalog: catalogs.ordersCatalog,
        tariffsCatalog: catalogs.tariffsCatalog,
        sverkiCatalog: catalogs.sverkiCatalog,
        dogovorsCatalog: catalogs.dogovorsCatalog,
        claimsCatalog: catalogs.claimsCatalog,
        sendingsPage,
        isDocFavorite,
        toggleDocFavorite,
        documentsOrderFormOpen,
        setDocumentsOrderFormOpenPersist,
        deliveryStatusFilterSet: filters.deliveryStatusFilterSet,
        setDeliveryStatusFilterSet: filters.setDeliveryStatusFilterSet,
        tableSortColumn: filters.tableSortColumn,
        tableSortOrder: filters.tableSortOrder,
        handleTableSort: filters.handleTableSort,
        innerTableSortColumn: filters.innerTableSortColumn,
        innerTableSortOrder: filters.innerTableSortOrder,
        handleInnerTableSort: filters.handleInnerTableSort,
        cargoStateByNumber: cargo.cargoStateByNumber,
        cargoRouteByNumber: cargo.cargoRouteByNumber,
        cargoSumPaidByNumber: cargo.cargoSumPaidByNumber,
        normCargoKey: cargo.normCargoKey,
        perevozkiItems: cargo.perevozkiItems,
        edoDocumentsSummary: catalogs.edoDocumentsSummary,
        cargoModeSwitchMotion,
        onOpenCargo,
    };
}
