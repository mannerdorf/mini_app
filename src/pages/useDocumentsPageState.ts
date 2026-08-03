import { useState, useMemo } from "react";
import { useReducedMotion } from "motion/react";
import { useDocFavorites } from "../features/documents/catalogs";
import { useDocumentsSendingsPage } from "../features/documents/sendings";
import { useDocumentsCargoContext } from "../features/documents/hooks/useDocumentsCargoContext";
import { useDocumentsPageNavigation } from "../features/documents/hooks/useDocumentsPageNavigation";
import { useDocumentsPageFilters } from "../features/documents/hooks/useDocumentsPageFilters";
import { useDocumentsCatalogs } from "../features/documents/hooks/useDocumentsCatalogs";
import { useDocumentsToolbarDropdowns } from "../features/documents/hooks/useDocumentsToolbarDropdowns";
import { useDocumentsUniqueFilterOptions } from "../features/documents/hooks/useDocumentsUniqueFilterOptions";
import { usePersistedDateFilter } from "../features/listWorkspace";
import type { AccountPermissions, AuthData, CargoItem } from "../types";
import { useDocumentsDateRange } from "./useDocumentsDateRange";
import { useDocumentsDataLoad } from "./useDocumentsDataLoad";
import { buildDocumentsPageToolbarProps } from "./useDocumentsPageToolbarProps";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import { cargoModeSwitchMotion } from "./cargoMotion";

export type DocumentsPageProps = {
    auth: AuthData;
    /** Визуал «SaaS analytics» для сводки и каркаса — как у «Грузов» (из App). */
    documentsServiceSaasUi?: boolean;
    useServiceRequest?: boolean;
    activeInn?: string;
    searchText?: string;
    onOpenCargo?: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
    onOpenAisWithMmsi?: (mmsi: string) => void;
    onOpenChat?: (context?: string) => void | Promise<void>;
    /** Права доступа (для зарегистрированных пользователей) */
    permissions?: AccountPermissions | null;
    /** Показывать суммы (финансовые показатели) */
    showSums?: boolean;
    /** Право «Аналитика» — платный вес, стоимость и итоги по ТС в «Отправках» */
    hasAnalytics?: boolean;
    /** Суперадминистратор (может менять EOR) */
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
    const prefersReducedMotion = useReducedMotion();
    const docsMotionEnabled = prefersReducedMotion !== true;

    const dateFilterState = usePersistedDateFilter();
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
    } = dateFilterState;

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
    const {
        customerFilter,
        setCustomerFilter,
        actCustomerFilter,
        setActCustomerFilter,
        edoStatusFilterSet,
        setEdoStatusFilterSet,
        deliveryStatusFilterSet,
        setDeliveryStatusFilterSet,
        billStatusFilterSet,
        setBillStatusFilterSet,
        typeFilterSet,
        setTypeFilterSet,
        routeFilterSet,
        setRouteFilterSet,
        invoiceFavoritesOnly,
        setInvoiceFavoritesOnly,
        isCustomerDropdownOpen,
        setIsCustomerDropdownOpen,
        isBillStatusDropdownOpen,
        setIsBillStatusDropdownOpen,
        isTypeDropdownOpen,
        setIsTypeDropdownOpen,
        isRouteDropdownOpen,
        setIsRouteDropdownOpen,
        sortBy,
        sortOrder,
        setSortBy,
        setSortOrder,
        tableSortColumn,
        tableSortOrder,
        innerTableSortColumn,
        innerTableSortOrder,
        transportFilter,
        setTransportFilter,
        transportSearchQuery,
        setTransportSearchQuery,
        isDeliveryStatusDropdownOpen,
        setIsDeliveryStatusDropdownOpen,
        isRouteCargoDropdownOpen,
        setIsRouteCargoDropdownOpen,
        isTransportDropdownOpen,
        setIsTransportDropdownOpen,
        isEdoStatusDropdownOpen,
        setIsEdoStatusDropdownOpen,
        isActCustomerDropdownOpen,
        setIsActCustomerDropdownOpen,
        isDateDropdownOpen,
        setIsDateDropdownOpen,
        dateDropdownMode,
        setDateDropdownMode,
        isCustomModalOpen,
        setIsCustomModalOpen,
        handleTableSort,
        handleInnerTableSort,
    } = filters;

    const { apiDateRange, perevozkiDateRange } = useDocumentsDateRange({
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
    });

    const {
        items,
        error,
        loading,
        actsItems,
        actsError,
        actsLoading,
        ordersItems,
        ordersError,
        ordersLoading,
        mutateOrders,
        sendingsItems,
        sendingsError,
        sendingsLoading,
        perevozkiItems: perevozkiItemsBase,
        perevozkiLoading,
        mutateInvoices,
        mutatePerevozki,
        mutateActs,
        mutateSendings,
    } = useDocumentsDataLoad({
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
        transportFilter,
        apiDateRange,
        perevozkiDateRange,
        perevozkiItemsBase,
        sendingsItems: sendingsItems || [],
    });
    const {
        normCargoKey,
        perevozkiItems,
        transportLinkedCargoNumbers,
        cargoStateByNumber,
        cargoRouteByNumber,
        cargoSumByNumber,
        cargoSumPaidByNumber,
        cargoTransportByNumber,
    } = cargo;

    const { isDocFavorite, toggleDocFavorite } = useDocFavorites();

    const catalogs = useDocumentsCatalogs({
        docSection,
        setDocSection,
        allowedDocSections,
        auth,
        items,
        actsItems,
        ordersItems,
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
    const {
        invoicesCatalog,
        actsCatalog,
        edoCatalog,
        ordersCatalog,
        tariffsCatalog,
        sverkiCatalog,
        dogovorsCatalog,
        claimsCatalog,
        edoDocumentsSummary,
    } = catalogs;

    const { uniqueCustomers, uniqueEdoStatuses } = useDocumentsUniqueFilterOptions({
        docSection,
        items,
        actsItems,
        dogovorsList: dogovorsCatalog.dogovorsList,
        sverkiList: sverkiCatalog.sverkiList,
    });

    const sendingsPage = useDocumentsSendingsPage({
        active: docSection === "Отправки",
        auth,
        effectiveActiveInn,
        effectiveServiceMode,
        showCustomerColumn,
        showSums,
        hasAnalytics,
        isSuperAdmin,
        permissions,
        sendingsItems: sendingsItems || [],
        sendingsLoading,
        sendingsError,
        perevozkiItems: perevozkiItems || [],
        cargoStateByNumber,
        cargoSumByNumber,
        normCargoKey,
        apiDateRange,
        customerFilter,
        effectiveSearchText,
        sortBy,
        sortOrder,
        transportFilter,
        setTransportFilter,
        transportLinkedCargoNumbers,
        typeFilterSet,
        routeFilterSet,
        deliveryStatusFilterSet,
        tableModeEffective,
        docsMotionEnabled,
        cargoModeSwitchMotion,
        onOpenCargo,
        onOpenAisWithMmsi,
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
    });

    const { closeDocumentsToolbarDropdownsExceptSendings, closeDocumentsToolbarDropdownsForTransport } =
        useDocumentsToolbarDropdowns({ filters, catalogs });

    const toolbarProps = buildDocumentsPageToolbarProps({
        effectiveServiceMode,
        customerFilter,
        setCustomerFilter,
        uniqueCustomers,
        uniqueOrderCustomers: ordersCatalog.uniqueOrderCustomers,
        isCustomerDropdownOpen,
        setIsCustomerDropdownOpen,
        actCustomerFilter,
        setActCustomerFilter,
        uniqueActCustomers: actsCatalog.uniqueActCustomers,
        isActCustomerDropdownOpen,
        setIsActCustomerDropdownOpen,
        edoStatusFilterSet,
        setEdoStatusFilterSet,
        uniqueEdoStatuses,
        isEdoStatusDropdownOpen,
        setIsEdoStatusDropdownOpen,
        billStatusFilterSet,
        setBillStatusFilterSet,
        invoiceFavoritesOnly,
        setInvoiceFavoritesOnly,
        isBillStatusDropdownOpen,
        setIsBillStatusDropdownOpen,
        deliveryStatusFilterSet,
        setDeliveryStatusFilterSet,
        isDeliveryStatusDropdownOpen,
        setIsDeliveryStatusDropdownOpen,
        typeFilterSet,
        setTypeFilterSet,
        isTypeDropdownOpen,
        setIsTypeDropdownOpen,
        routeFilterSet,
        setRouteFilterSet,
        isRouteDropdownOpen,
        setIsRouteDropdownOpen,
        isRouteCargoDropdownOpen,
        setIsRouteCargoDropdownOpen,
        transportFilter,
        setTransportFilter,
        transportOptionsCurrentSection: sendingsPage.transportOptionsCurrentSection,
        isTransportDropdownOpen,
        setIsTransportDropdownOpen,
        transportSearchQuery,
        setTransportSearchQuery,
        tariffsCatalog,
        sverkiCatalog,
        dogovorsCatalog,
        claimsCatalog,
        ordersCatalog,
        actsCatalog,
        edoCatalog,
        closeDocumentsToolbarDropdownsExceptSendings,
        dateFilterProps: {
            sortOrder,
            onToggleSort: () => { setSortBy('date'); setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); },
            dateFilter,
            setDateFilter,
            apiDateRange,
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
            isDateDropdownOpen,
            setIsDateDropdownOpen,
            dateDropdownMode,
            setDateDropdownMode,
            isCustomModalOpen,
            setIsCustomModalOpen,
        },
        loading,
        error,
        actsLoading,
        actsError,
        invoicesSummary: invoicesCatalog.documentsSummary,
        filteredInvoiceCount: invoicesCatalog.filteredInvoiceItems.length,
        actsSummary: actsCatalog.actsSummary,
        filteredActsCount: actsCatalog.filteredActs.length,
        showSums,
        documentsServiceSaasUi,
        tableModeFlatDirect,
        docsMotionEnabled,
        auth,
        effectiveActiveInn,
        onNewOrder: () => setDocumentsOrderFormOpenPersist(true),
        onOpenClaimsCreate: () => claimsCatalog.openClaimsCreateModal(),
        onOpenSverkiOrder: sverkiCatalog.openSverkiOrderModal,
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
        loading,
        error,
        perevozkiLoading,
        actsLoading,
        actsError,
        ordersLoading,
        ordersError,
        mutateInvoices,
        mutatePerevozki,
        mutateActs,
        mutateOrders,
        mutateSendings,
        items,
        invoicesCatalog,
        actsCatalog,
        edoCatalog,
        ordersCatalog,
        tariffsCatalog,
        sverkiCatalog,
        dogovorsCatalog,
        claimsCatalog,
        sendingsPage,
        isDocFavorite,
        toggleDocFavorite,
        documentsOrderFormOpen,
        setDocumentsOrderFormOpenPersist,
        deliveryStatusFilterSet,
        setDeliveryStatusFilterSet,
        tableSortColumn,
        tableSortOrder,
        handleTableSort,
        innerTableSortColumn,
        innerTableSortOrder,
        handleInnerTableSort,
        cargoStateByNumber,
        cargoRouteByNumber,
        cargoSumPaidByNumber,
        normCargoKey,
        perevozkiItems,
        edoDocumentsSummary,
        cargoModeSwitchMotion,
        onOpenCargo,
    };
}
