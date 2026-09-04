import { useEffect, useState, useCallback } from "react";
import {
    initSharedFilterSets,
    saveSharedListFilters,
    sharedFromFilterSets,
    type CargoStatusFilterKey,
    type RouteFilterKey,
    type SharedBillStatusKey,
    type TypeFilterKey,
} from "../../../lib/sharedListFilters";
import { HAULZ_PULL_REFRESH_EVENT } from "../../../lib/pullRefreshEvents";
import { useResetAllFiltersListener } from "../../../hooks/useResetAllFiltersListener";

export function useDocumentsPageFilters(effectiveServiceMode: boolean) {
    const [customerFilter, setCustomerFilter] = useState<string>("");
    const [actCustomerFilter, setActCustomerFilter] = useState<string>("");
    const [edoStatusFilterSet, setEdoStatusFilterSet] = useState<Set<string>>(() => new Set());
    const sharedFiltersInit = initSharedFilterSets();
    const [deliveryStatusFilterSet, setDeliveryStatusFilterSet] = useState<Set<CargoStatusFilterKey>>(() => sharedFiltersInit.statusFilterSet);
    const [billStatusFilterSet, setBillStatusFilterSet] = useState<Set<SharedBillStatusKey>>(() => sharedFiltersInit.billStatusFilterSet);
    const [typeFilterSet, setTypeFilterSet] = useState<Set<TypeFilterKey>>(() => sharedFiltersInit.typeFilterSet);
    const [routeFilterSet, setRouteFilterSet] = useState<Set<RouteFilterKey>>(() => sharedFiltersInit.routeFilterSet);
    const [invoiceFavoritesOnly, setInvoiceFavoritesOnly] = useState(false);
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [isBillStatusDropdownOpen, setIsBillStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const [sortBy, setSortBy] = useState<"date" | null>("date");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [tableSortColumn, setTableSortColumn] = useState<"customer" | "sum" | "count">("customer");
    const [tableSortOrder, setTableSortOrder] = useState<"asc" | "desc">("asc");
    const [innerTableSortColumn, setInnerTableSortColumn] = useState<"number" | "date" | "status" | "sum" | "paid" | "balance" | "deliveryStatus" | "route">("date");
    const [innerTableSortOrder, setInnerTableSortOrder] = useState<"asc" | "desc">("desc");
    const [transportFilter, setTransportFilter] = useState<string>("");
    const [transportSearchQuery, setTransportSearchQuery] = useState<string>("");
    const [isDeliveryStatusDropdownOpen, setIsDeliveryStatusDropdownOpen] = useState(false);
    const [isRouteCargoDropdownOpen, setIsRouteCargoDropdownOpen] = useState(false);
    const [isTransportDropdownOpen, setIsTransportDropdownOpen] = useState(false);
    const [isEdoStatusDropdownOpen, setIsEdoStatusDropdownOpen] = useState(false);
    const [isActCustomerDropdownOpen, setIsActCustomerDropdownOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [dateDropdownMode, setDateDropdownMode] = useState<"main" | "months" | "quarters" | "years" | "weeks">("main");
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

    useEffect(() => {
        saveSharedListFilters(sharedFromFilterSets({
            statusFilterSet: deliveryStatusFilterSet,
            billStatusFilterSet,
            typeFilterSet,
            routeFilterSet,
        }));
    }, [deliveryStatusFilterSet, billStatusFilterSet, typeFilterSet, routeFilterSet]);

    useEffect(() => {
        const reloadSharedFilters = () => {
            const init = initSharedFilterSets();
            setDeliveryStatusFilterSet(init.statusFilterSet);
            setBillStatusFilterSet(init.billStatusFilterSet);
            setTypeFilterSet(init.typeFilterSet);
            setRouteFilterSet(init.routeFilterSet);
        };
        window.addEventListener(HAULZ_PULL_REFRESH_EVENT, reloadSharedFilters);
        return () => window.removeEventListener(HAULZ_PULL_REFRESH_EVENT, reloadSharedFilters);
    }, []);

    const resetDocumentsPageFilters = useCallback(() => {
        const init = initSharedFilterSets();
        setCustomerFilter("");
        setActCustomerFilter("");
        setEdoStatusFilterSet(new Set());
        setDeliveryStatusFilterSet(init.statusFilterSet);
        setBillStatusFilterSet(init.billStatusFilterSet);
        setTypeFilterSet(init.typeFilterSet);
        setRouteFilterSet(init.routeFilterSet);
        setInvoiceFavoritesOnly(false);
        setTransportFilter("");
        setTransportSearchQuery("");
        setSortBy("date");
        setSortOrder("desc");
        setIsCustomerDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsBillStatusDropdownOpen(false);
        setIsTypeDropdownOpen(false);
        setIsRouteDropdownOpen(false);
        setIsDeliveryStatusDropdownOpen(false);
        setIsRouteCargoDropdownOpen(false);
        setIsTransportDropdownOpen(false);
        setIsEdoStatusDropdownOpen(false);
        setIsDateDropdownOpen(false);
    }, []);
    useResetAllFiltersListener(resetDocumentsPageFilters);

    useEffect(() => {
        if (effectiveServiceMode) return;
        setCustomerFilter("");
        setActCustomerFilter("");
        setTransportFilter("");
        setIsCustomerDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsTransportDropdownOpen(false);
    }, [effectiveServiceMode]);

    const handleTableSort = (column: "customer" | "sum" | "count") => {
        if (tableSortColumn === column) setTableSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        else {
            setTableSortColumn(column);
            setTableSortOrder("asc");
        }
    };

    const handleInnerTableSort = (column: "number" | "date" | "status" | "sum" | "paid" | "balance" | "deliveryStatus" | "route") => {
        if (innerTableSortColumn === column) setInnerTableSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        else {
            setInnerTableSortColumn(column);
            setInnerTableSortOrder(column === "date" ? "desc" : "asc");
        }
    };

    return {
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
        setSortBy,
        sortOrder,
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
    };
}

export type DocumentsPageFiltersState = ReturnType<typeof useDocumentsPageFilters>;
