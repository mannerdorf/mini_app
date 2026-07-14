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
import {
    collectUniqueCachedDocumentEdoLabels,
    collectUniqueInvoiceEdoTableLabels,
} from "../lib/edoStatus";
import {
    initSharedFilterSets,
    saveSharedListFilters,
    sharedFromFilterSets,
    type CargoStatusFilterKey,
    type RouteFilterKey,
    type SharedBillStatusKey,
    type TypeFilterKey,
} from "../lib/sharedListFilters";
import { usePersistedDateFilter } from "../features/listWorkspace";
import type { AccountPermissions, AuthData, CargoItem } from "../types";
import { useDocumentsDateRange } from "./useDocumentsDateRange";
import { useDocumentsDataLoad } from "./useDocumentsDataLoad";
import { buildDocumentsPageToolbarProps } from "./useDocumentsPageToolbarProps";
import { useCargoTransportFilter, usePerevozki } from "../hooks/useApi";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import {
    buildCargoRouteByNumber,
    buildCargoStateByNumber,
    buildCargoSumByNumber,
    buildCargoTransportByNumber,
    buildInvoicesSummary,
    buildTransportLinkedCargoNumbersInPeriod,
    getActUpdEdoInfo,
} from "../features/documents/lib/documentsPipeline";
import { buildCargoSumPaidByNumber } from "../../lib/invoiceAmounts.js";
import {
    DOC_SECTIONS,
    DOC_SECTION_TO_PERMISSION,
    type DocSectionKey,
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
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months' | 'years' | 'weeks'>('main');
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [customerFilter, setCustomerFilter] = useState<string>('');
    const [actCustomerFilter, setActCustomerFilter] = useState<string>('');
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
    const [sortBy, setSortBy] = useState<'date' | null>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const DOCS_TABLE_MODE_KEY = 'haulz.docs.tableMode';
    const DOCS_SECTION_KEY = 'haulz.docs.section';
    const DOCS_NEW_ORDER_KEY = 'haulz.docs.orders.newFormOpen';

    const readDocumentsNewOrderOpen = useCallback((): boolean => {
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.get('newOrder') === '1') return true;
            return window.localStorage.getItem(DOCS_NEW_ORDER_KEY) === '1';
        } catch {
            return false;
        }
    }, []);

    const persistDocumentsNewOrderOpen = useCallback((open: boolean) => {
        try {
            const url = new URL(window.location.href);
            if (open) {
                url.searchParams.set('newOrder', '1');
                url.searchParams.set('section', 'Заявки');
                window.localStorage.setItem(DOCS_NEW_ORDER_KEY, '1');
                window.localStorage.setItem(DOCS_SECTION_KEY, 'Заявки');
            } else {
                url.searchParams.delete('newOrder');
                window.localStorage.removeItem(DOCS_NEW_ORDER_KEY);
            }
            window.history.replaceState(null, '', url.toString());
        } catch {
            /* ignore */
        }
    }, []);
    const [tableModeByCustomer, setTableModeByCustomer] = useState<boolean>(() => {
        try {
            const v = localStorage.getItem(DOCS_TABLE_MODE_KEY);
            return v === 'true';
        } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem(DOCS_TABLE_MODE_KEY, String(tableModeByCustomer)); } catch { /* ignore */ }
    }, [tableModeByCustomer]);
    const tableModeGroupedByCustomer = tableModeByCustomer && showCustomerColumn;
    const tableModeFlatDirect = tableModeByCustomer && !showCustomerColumn;
    const groupedCustomerTableColSpan = useMemo(
        () => (showCustomerColumn ? 1 : 0) + (showSums ? 1 : 0) + 1,
        [showCustomerColumn, showSums],
    );
    const [expandedTableCustomer, setExpandedTableCustomer] = useState<string | null>(null);
    const [documentsOrderFormOpen, setDocumentsOrderFormOpen] = useState(() => readDocumentsNewOrderOpen());
    const setDocumentsOrderFormOpenPersist = useCallback((open: boolean) => {
        setDocumentsOrderFormOpen(open);
        persistDocumentsNewOrderOpen(open);
    }, [persistDocumentsNewOrderOpen]);
    const allowedDocSections = useMemo(() => {
        if (!permissions) return DOC_SECTIONS;
        return DOC_SECTIONS.filter(({ key }) => {
            if (key === 'ЭДО') return true;
            if (key === 'Отправки') return permissions.doc_sendings === true && permissions.haulz === true;
            if (key === 'Претензии') return permissions.doc_claims === true;
            return permissions[DOC_SECTION_TO_PERMISSION[key]] !== false;
        });
    }, [permissions]);
    const defaultDocSection = allowedDocSections[0]?.key ?? 'ЭДО';
    const [docSection, setDocSection] = useState<DocSectionKey>(() => {
        try {
            const url = new URL(window.location.href);
            const fromUrl = url.searchParams.get('section')?.trim();
            if (fromUrl && DOC_SECTIONS.some(({ key }) => key === fromUrl)) {
                return fromUrl as DocSectionKey;
            }
            const v = localStorage.getItem(DOCS_SECTION_KEY) as DocSectionKey | null;
            if (v && DOC_SECTIONS.some(({ key }) => key === v)) return v;
        } catch { /* ignore */ }
        return defaultDocSection;
    });
    useEffect(() => {
        if (!documentsOrderFormOpen || docSection === 'Заявки') return;
        setDocSection('Заявки');
        try {
            localStorage.setItem(DOCS_SECTION_KEY, 'Заявки');
        } catch {
            /* ignore */
        }
    }, [documentsOrderFormOpen, docSection]);
    useEffect(() => {
        const isAllowed = allowedDocSections.some(({ key }) => key === docSection);
        if (!isAllowed && allowedDocSections.length > 0) {
            setDocSection(defaultDocSection);
            try { localStorage.setItem(DOCS_SECTION_KEY, defaultDocSection); } catch { /* ignore */ }
        } else {
            try { localStorage.setItem(DOCS_SECTION_KEY, docSection); } catch { /* ignore */ }
        }
    }, [allowedDocSections, docSection, defaultDocSection]);
    const serviceModeForCurrentDocSection = effectiveServiceMode || docSection === 'Отправки';
    const [tableSortColumn, setTableSortColumn] = useState<'customer' | 'sum' | 'count'>('customer');
    const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
    const [innerTableSortColumn, setInnerTableSortColumn] = useState<'number' | 'date' | 'status' | 'sum' | 'paid' | 'balance' | 'deliveryStatus' | 'route'>('date');
    const [innerTableSortOrder, setInnerTableSortOrder] = useState<'asc' | 'desc'>('desc');
    const [transportFilter, setTransportFilter] = useState<string>('');
    const [transportSearchQuery, setTransportSearchQuery] = useState<string>('');
    const [isDeliveryStatusDropdownOpen, setIsDeliveryStatusDropdownOpen] = useState(false);
    const [isRouteCargoDropdownOpen, setIsRouteCargoDropdownOpen] = useState(false);
    const [isTransportDropdownOpen, setIsTransportDropdownOpen] = useState(false);
    const [isEdoStatusDropdownOpen, setIsEdoStatusDropdownOpen] = useState(false);
    const [isActCustomerDropdownOpen, setIsActCustomerDropdownOpen] = useState(false);

    useEffect(() => {
        saveSharedListFilters(sharedFromFilterSets({
            statusFilterSet: deliveryStatusFilterSet,
            billStatusFilterSet,
            typeFilterSet,
            routeFilterSet,
        }));
    }, [deliveryStatusFilterSet, billStatusFilterSet, typeFilterSet, routeFilterSet]);

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

    // При выходе из служебного режима прячем и сбрасываем "компанийные" фильтры.
    useEffect(() => {
        if (effectiveServiceMode) return;
        setCustomerFilter('');
        setActCustomerFilter('');
        setTransportFilter('');
        setIsCustomerDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsTransportDropdownOpen(false);
    }, [effectiveServiceMode]);

    /** Канонический ключ для сопоставления номера перевозки (с/без ведущих нулей) */
    const normCargoKey = useCallback((num: string | null | undefined): string => {
        if (num == null) return '';
        const s = String(num).replace(/^0000-/, '').trim().replace(/^0+/, '') || '0';
        return s;
    }, []);

    const { cargoNumbers: dbTransportCargoNumbers, loading: dbTransportLoading } = useCargoTransportFilter({
        auth,
        vehicle: transportFilter,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        useServiceRequest: serviceModeForCurrentDocSection,
        enabled: !!serviceModeForCurrentDocSection && !!transportFilter,
    });

    const transportLinkedCargoNumbers = useMemo(() => {
        if (!serviceModeForCurrentDocSection || !transportFilter || dbTransportLoading) return undefined;
        if (dbTransportCargoNumbers.length > 0) {
            return new Set(dbTransportCargoNumbers.map((n) => normCargoKey(n)).filter(Boolean));
        }
        return buildTransportLinkedCargoNumbersInPeriod(
            sendingsItems,
            apiDateRange.dateFrom,
            apiDateRange.dateTo,
            transportFilter,
        );
    }, [
        serviceModeForCurrentDocSection,
        transportFilter,
        dbTransportCargoNumbers,
        dbTransportLoading,
        sendingsItems,
        apiDateRange.dateFrom,
        apiDateRange.dateTo,
        normCargoKey,
    ]);

    const includeCargoNumbersForTransport = useMemo(() => {
        if (!transportLinkedCargoNumbers?.size) return [];
        const existing = new Set(
            (perevozkiItemsBase || []).map((i: any) => normCargoKey(String(i?.Number ?? i?.number ?? ""))).filter(Boolean),
        );
        return [...transportLinkedCargoNumbers].filter((n) => !existing.has(n));
    }, [transportLinkedCargoNumbers, perevozkiItemsBase, normCargoKey]);

    const { items: transportLinkedPerevozkiItems } = usePerevozki({
        auth,
        dateFrom: perevozkiDateRange.dateFrom,
        dateTo: perevozkiDateRange.dateTo,
        inn: effectiveActiveInn || undefined,
        useServiceRequest: serviceModeForCurrentDocSection,
        includeCargoNumbers: includeCargoNumbersForTransport,
        enabled: !!serviceModeForCurrentDocSection && !!transportFilter && includeCargoNumbersForTransport.length > 0,
    });

    const perevozkiItems = useMemo(() => {
        if (!transportFilter || !transportLinkedPerevozkiItems.length) return perevozkiItemsBase || [];
        const byNumber = new Map<string, any>();
        for (const item of perevozkiItemsBase || []) {
            const key = normCargoKey(String(item?.Number ?? item?.number ?? ""));
            if (key) byNumber.set(key, item);
        }
        for (const item of transportLinkedPerevozkiItems) {
            const key = normCargoKey(String(item?.Number ?? item?.number ?? ""));
            if (key && !byNumber.has(key)) byNumber.set(key, item);
        }
        return Array.from(byNumber.values());
    }, [perevozkiItemsBase, transportLinkedPerevozkiItems, transportFilter, normCargoKey]);

    const cargoStateByNumber = useMemo(
        () => buildCargoStateByNumber(perevozkiItems || []),
        [perevozkiItems]
    );

    const cargoRouteByNumber = useMemo(
        () => buildCargoRouteByNumber(perevozkiItems || []),
        [perevozkiItems]
    );

    const cargoSumByNumber = useMemo(
        () => buildCargoSumByNumber(perevozkiItems || []),
        [perevozkiItems]
    );
    const cargoSumPaidByNumber = useMemo(
        () => buildCargoSumPaidByNumber((perevozkiItems || []) as Record<string, unknown>[]),
        [perevozkiItems],
    );

    const cargoTransportByNumber = useMemo(() => {
        const base = buildCargoTransportByNumber(perevozkiItems || []);
        (sendingsItems || []).forEach((row: any) => {
            const transport = String(
                row?.АвтомобильCMRНаименование
                ?? row?.AutoReg
                ?? row?.autoReg
                ?? row?.AutoType
                ?? ''
            ).trim();
            if (!transport) return;
            const numbers: string[] = [];
            const addNumber = (value: unknown) => {
                const v = String(value ?? '').trim();
                if (v) numbers.push(v);
            };
            addNumber(row?.НомерПеревозки);
            addNumber(row?.CargoNumber);
            addNumber(row?.NumberPerevozki);
            addNumber(row?.ИДОтправления);
            const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
            const parcels = Array.isArray(rawParcels)
                ? rawParcels
                : (rawParcels && typeof rawParcels === 'object'
                    ? Object.values(rawParcels as Record<string, any>)
                    : []);
            parcels.forEach((parcel: any) => {
                addNumber(parcel?.ИДОтправления);
                addNumber(parcel?.НомерПеревозки);
                addNumber(parcel?.CargoNumber);
                addNumber(parcel?.NumberPerevozki);
                const goodsRaw = parcel?.Товары;
                const goods = Array.isArray(goodsRaw)
                    ? (goodsRaw[0] ?? {})
                    : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : null);
                if (goods && typeof goods === 'object') {
                    addNumber((goods as any)?.ИДОтправления);
                    addNumber((goods as any)?.НомерПеревозки);
                    addNumber((goods as any)?.CargoNumber);
                    addNumber((goods as any)?.NumberPerevozki);
                }
            });
            Array.from(new Set(numbers)).forEach((raw) => {
                const key = normCargoKey(raw);
                base.set(key, transport);
                if (key !== raw) base.set(raw, transport);
            });
        });
        return base;
    }, [perevozkiItems, sendingsItems, normCargoKey]);

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

    const tableModeEffective = tableModeByCustomer;

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

    const handleTableSort = (column: 'customer' | 'sum' | 'count') => {
        if (tableSortColumn === column) setTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setTableSortColumn(column); setTableSortOrder('asc'); }
    };

    const handleInnerTableSort = (column: 'number' | 'date' | 'status' | 'sum' | 'paid' | 'balance' | 'deliveryStatus' | 'route') => {
        if (innerTableSortColumn === column) setInnerTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setInnerTableSortColumn(column); setInnerTableSortOrder(column === 'date' ? 'desc' : 'asc'); }
    };

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
