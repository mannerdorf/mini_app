import { useState, useCallback, useMemo, useEffect } from "react";
import { useReducedMotion } from "motion/react";
import {
    useDocumentsInvoices,
} from "../features/documents/invoices";
import {
    useDocumentsActs,
} from "../features/documents/acts";
import {
    useDocumentsEdo,
} from "../features/documents/edo";
import {
    useDocumentsOrders,
} from "../features/documents/orders";
import {
    useDocFavorites,
    useDocumentsTariffs,
    useDocumentsSverki,
    useDocumentsDogovors,
} from "../features/documents/catalogs";
import {
    useDocumentsSendingsPage,
} from "../features/documents/sendings";
import {
    useDocumentsClaims,
} from "../features/documents/claims";
import { useDocumentsCargoContext } from "../features/documents/hooks/useDocumentsCargoContext";
import { useDocumentsPageNavigation } from "../features/documents/hooks/useDocumentsPageNavigation";
import { useDocumentsPageFilters } from "../features/documents/hooks/useDocumentsPageFilters";
import {
    collectUniqueCachedDocumentEdoLabels,
    collectUniqueInvoiceEdoTableLabels,
} from "../lib/edoStatus";
import { usePersistedDateFilter } from "../features/listWorkspace";
import type { AccountPermissions, AuthData, CargoItem } from "../types";
import { useDocumentsDateRange } from "./useDocumentsDateRange";
import { useDocumentsDataLoad } from "./useDocumentsDataLoad";
import { buildDocumentsPageToolbarProps } from "./useDocumentsPageToolbarProps";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import {
    buildCargoRouteByNumber,
    buildCargoStateByNumber,
    buildCargoSumByNumber,
    buildInvoicesSummary,
    getActUpdEdoInfo,
} from "../features/documents/lib/documentsPipeline";
import {
} from "../features/documents";
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

    const invoiceFilterInputs = useMemo(
        () => ({
            billStatusFilterSet,
            deliveryStatusFilterSet,
            typeFilterSet,
            routeFilterSet,
            invoiceFavoritesOnly,
            edoStatusFilterSet,
            transportFilter,
            edoCounterpartyFilter: "all" as const,
        }),
        [
            billStatusFilterSet,
            deliveryStatusFilterSet,
            typeFilterSet,
            routeFilterSet,
            invoiceFavoritesOnly,
            edoStatusFilterSet,
            transportFilter,
        ],
    );

    const invoicesCatalog = useDocumentsInvoices({
        active: docSection === "Счета",
        items,
        actsItems,
        perevozkiItems,
        effectiveActiveInn,
        effectiveServiceMode,
        customerFilter,
        effectiveSearchText,
        sortBy,
        sortOrder,
        tableModeGroupedByCustomer,
        tableSortColumn,
        tableSortOrder,
        innerTableSortColumn,
        innerTableSortOrder,
        invoiceFilterInputs,
        transportLinkedCargoNumbers,
        cargoStateByNumber,
        cargoRouteByNumber,
        cargoTransportByNumber,
        cargoSumPaidByNumber,
        normCargoKey,
        expandedTableCustomer,
        setExpandedTableCustomer,
    });

    const edoCatalog = useDocumentsEdo({
        active: docSection === "ЭДО",
        items,
        perevozkiItems,
        effectiveActiveInn,
        effectiveServiceMode,
        customerFilter,
        effectiveSearchText,
        sortBy,
        sortOrder,
        tableSortColumn,
        tableSortOrder,
        invoiceFilterInputs,
        transportLinkedCargoNumbers,
        cargoStateByNumber,
        cargoRouteByNumber,
        cargoTransportByNumber,
        isInvoiceFavorite: invoicesCatalog.isInvoiceFavorite,
        expandedTableCustomer,
        setExpandedTableCustomer,
    });

    const actsCatalog = useDocumentsActs({
        active: docSection === "УПД",
        actsItems,
        items,
        perevozkiItems,
        effectiveActiveInn,
        effectiveServiceMode,
        actCustomerFilter,
        effectiveSearchText,
        edoStatusFilterSet,
        transportFilter,
        transportLinkedCargoNumbers,
        sortOrder,
        tableModeGroupedByCustomer,
        tableSortColumn,
        tableSortOrder,
        cargoTransportByNumber,
        cargoStateByNumber,
        cargoRouteByNumber,
        normCargoKey,
    });

    const ordersCatalog = useDocumentsOrders({
        active: docSection === "Заявки",
        ordersItems,
        effectiveActiveInn,
        effectiveServiceMode,
        customerFilter,
        effectiveSearchText,
        sortBy,
        sortOrder,
    });

    const tariffsCatalog = useDocumentsTariffs({
        active: docSection === "Тарифы",
        effectiveActiveInn,
        effectiveServiceMode,
    });

    const sverkiCatalog = useDocumentsSverki({
        active: docSection === "Акты сверок",
        auth,
        effectiveActiveInn,
        effectiveServiceMode,
        apiDateRange,
        edoStatusFilterSet,
    });

    const dogovorsCatalog = useDocumentsDogovors({
        active: docSection === "Договоры",
        effectiveActiveInn,
        effectiveServiceMode,
        edoStatusFilterSet,
    });

    const claimsCatalog = useDocumentsClaims({
        active: docSection === "Претензии",
        auth,
        effectiveActiveInn,
        effectiveServiceMode,
        sortOrder,
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
        allowedDocSections,
        onNavigateToClaims: () => setDocSection("Претензии"),
        items,
        perevozkiItems,
    });

    const edoDocumentsSummary = useMemo(
        () => buildInvoicesSummary(edoCatalog.filteredEdoItems, actsItems, perevozkiItems),
        [edoCatalog.filteredEdoItems, actsItems, perevozkiItems],
    );

    useEffect(() => {
        ordersCatalog.resetExpandedOrderRow();
    }, [docSection, dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter, ordersCatalog.resetExpandedOrderRow]);

    const uniqueCustomers = useMemo(() => [...new Set(items.map(i => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim())).filter(Boolean))].sort(), [items]);

    const uniqueEdoStatuses = useMemo(() => {
        if (docSection === 'Счета' || docSection === 'ЭДО') {
            return collectUniqueInvoiceEdoTableLabels(items);
        }
        if (docSection === 'Договоры') {
            return collectUniqueCachedDocumentEdoLabels(dogovorsCatalog.dogovorsList);
        }
        if (docSection === 'Акты сверок') {
            return collectUniqueCachedDocumentEdoLabels(sverkiCatalog.sverkiList);
        }
        const set = new Set<string>();
        if (docSection === 'УПД') {
            (actsItems || []).forEach((a: any) => {
                const edo = getActUpdEdoInfo(a, items);
                if (edo.raw) set.add(edo.label);
            });
        }
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [docSection, items, actsItems, dogovorsCatalog.dogovorsList, sverkiCatalog.sverkiList]);

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

    const closeDocumentsToolbarDropdownsExceptSendings = useCallback(() => {
        setIsDateDropdownOpen(false);
        setIsCustomerDropdownOpen(false);
        ordersCatalog.setIsReceiverDropdownOpen(false);
        ordersCatalog.setIsOrderSenderDropdownOpen(false);
        ordersCatalog.setIsOrderRouteDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsBillStatusDropdownOpen(false);
        setIsRouteDropdownOpen(false);
        setIsEdoStatusDropdownOpen(false);
        setIsTransportDropdownOpen(false);
        edoCatalog.setIsEdoCounterpartyDropdownOpen(false);
        claimsCatalog.closeClaimsDropdowns();
        tariffsCatalog.closeTariffsDropdowns();
        sverkiCatalog.closeSverkiDropdowns();
        dogovorsCatalog.closeDogovorsDropdowns();
    }, [ordersCatalog, edoCatalog, claimsCatalog, tariffsCatalog, sverkiCatalog, dogovorsCatalog]);
    const closeDocumentsToolbarDropdownsForTransport = useCallback(() => {
        setIsDateDropdownOpen(false);
        setIsCustomerDropdownOpen(false);
        ordersCatalog.setIsReceiverDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsTypeDropdownOpen(false);
        setIsRouteDropdownOpen(false);
        setIsDeliveryStatusDropdownOpen(false);
        setIsRouteCargoDropdownOpen(false);
        setIsEdoStatusDropdownOpen(false);
    }, [ordersCatalog]);

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
