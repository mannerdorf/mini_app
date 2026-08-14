import { useEffect, useMemo } from "react";
import {
    useDocumentsInvoices,
} from "../invoices";
import {
    useDocumentsActs,
} from "../acts";
import {
    useDocumentsEdo,
} from "../edo";
import {
    useDocumentsOrders,
} from "../orders";
import {
    useDocumentsTariffs,
    useDocumentsSverki,
    useDocumentsDogovors,
} from "../catalogs";
import {
    useDocumentsClaims,
} from "../claims";
import { buildInvoicesSummary } from "../lib/documentsPipeline";
import type { AuthData, CargoItem } from "../../../types";
import type { DocSectionKey } from "../documentsSectionConstants";
import type { DocumentsCargoContextState } from "./useDocumentsCargoContext";
import type { DocumentsPageFiltersState } from "./useDocumentsPageFilters";
import type { DateFilterState } from "../../../lib/dateUtils";

export type UseDocumentsCatalogsParams = {
    docSection: DocSectionKey;
    setDocSection: (section: DocSectionKey) => void;
    allowedDocSections: DocSectionKey[];
    auth: AuthData;
    items: CargoItem[];
    actsItems: CargoItem[];
    ordersItems: CargoItem[];
    effectiveActiveInn?: string;
    activeCustomerName?: string;
    onOrdersMutate?: () => void;
    effectiveServiceMode: boolean;
    effectiveSearchText?: string;
    apiDateRange: { dateFrom: string; dateTo: string };
    cargo: Pick<
        DocumentsCargoContextState,
        | "normCargoKey"
        | "perevozkiItems"
        | "transportLinkedCargoNumbers"
        | "cargoStateByNumber"
        | "cargoRouteByNumber"
        | "cargoTransportByNumber"
        | "cargoSumPaidByNumber"
    >;
    filters: Pick<
        DocumentsPageFiltersState,
        | "customerFilter"
        | "actCustomerFilter"
        | "edoStatusFilterSet"
        | "transportFilter"
        | "billStatusFilterSet"
        | "deliveryStatusFilterSet"
        | "typeFilterSet"
        | "routeFilterSet"
        | "invoiceFavoritesOnly"
        | "sortBy"
        | "sortOrder"
        | "tableSortColumn"
        | "tableSortOrder"
        | "innerTableSortColumn"
        | "innerTableSortOrder"
    >;
    dateFilterState: Pick<
        DateFilterState,
        | "dateFilter"
        | "customDateFrom"
        | "customDateTo"
        | "selectedMonthForFilter"
        | "selectedYearForFilter"
        | "selectedWeekForFilter"
    >;
    tableModeGroupedByCustomer: boolean;
    expandedTableCustomer: string | null;
    setExpandedTableCustomer: (value: string | null) => void;
};

/** Подключает каталоги разделов «Документы» (счета, УПД, ЭДО, заявки и т.д.). */
export function useDocumentsCatalogs({
    docSection,
    setDocSection,
    allowedDocSections,
    auth,
    items,
    actsItems,
    ordersItems,
    effectiveActiveInn,
    activeCustomerName,
    onOrdersMutate,
    effectiveServiceMode,
    effectiveSearchText,
    apiDateRange,
    cargo,
    filters,
    dateFilterState,
    tableModeGroupedByCustomer,
    expandedTableCustomer,
    setExpandedTableCustomer,
}: UseDocumentsCatalogsParams) {
    const {
        normCargoKey,
        perevozkiItems,
        transportLinkedCargoNumbers,
        cargoStateByNumber,
        cargoRouteByNumber,
        cargoTransportByNumber,
        cargoSumPaidByNumber,
    } = cargo;

    const {
        customerFilter,
        actCustomerFilter,
        edoStatusFilterSet,
        transportFilter,
        billStatusFilterSet,
        deliveryStatusFilterSet,
        typeFilterSet,
        routeFilterSet,
        invoiceFavoritesOnly,
        sortBy,
        sortOrder,
        tableSortColumn,
        tableSortOrder,
        innerTableSortColumn,
        innerTableSortOrder,
    } = filters;

    const {
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
    } = dateFilterState;

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
        auth,
        effectiveActiveInn,
        activeCustomerName,
        effectiveServiceMode,
        customerFilter,
        effectiveSearchText,
        sortBy,
        sortOrder,
        onOrdersMutate,
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
    }, [
        docSection,
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
        ordersCatalog.resetExpandedOrderRow,
    ]);

    return {
        invoiceFilterInputs,
        invoicesCatalog,
        edoCatalog,
        actsCatalog,
        ordersCatalog,
        tariffsCatalog,
        sverkiCatalog,
        dogovorsCatalog,
        claimsCatalog,
        edoDocumentsSummary,
    };
}

export type DocumentsCatalogsState = ReturnType<typeof useDocumentsCatalogs>;
