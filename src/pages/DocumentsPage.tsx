import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { ServiceRefreshFrom1cButton } from "../components/ServiceRefreshFrom1cButton";
import { serviceRefreshKindsForDocumentsSection } from "../lib/serviceRefreshFrom1c";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { CustomPeriodModal } from "../components/modals/CustomPeriodModal";
import {
    useDocumentsInvoices,
    DocumentsInvoicesSection,
} from "../features/documents/invoices";
import {
    useDocumentsActs,
    DocumentsActsSection,
    DocumentsActsToolbarFilters,
} from "../features/documents/acts";
import {
    useDocumentsEdo,
    DocumentsEdoSection,
    DocumentsEdoToolbarFilters,
} from "../features/documents/edo";
import {
    useDocumentsOrders,
    DocumentsOrdersSection,
    DocumentsOrdersToolbarFilters,
} from "../features/documents/orders";
import {
    useDocFavorites,
    useDocumentsTariffs,
    useDocumentsSverki,
    useDocumentsDogovors,
    DocumentsTariffsSection,
    DocumentsTariffsToolbarFilters,
    DocumentsSverkiSection,
    DocumentsSverkiToolbarFilters,
    DocumentsDogovorsSection,
    DocumentsDogovorsToolbarFilters,
    SverkiOrderActionButton,
} from "../features/documents/catalogs";
import { DocumentsOrderForm } from "../features/documents/orders";
import {
    SendingsInfographic,
    SendingsPreface,
    SendingsSection,
    SendingsToolbarFilters,
    useSendingsBulkActions,
    useSendingsFerryActions,
    useSendingsServerSync,
    useSendingsSectionProps,
    useSendingsSortState,
    getSendingSanctionResult,
    useSendingsRowRuntime,
    useSendingsStatusKeyResolver,
    useSendingsVisibleMeta,
    useSendingsListPipeline,
    useSendingsBaseFilter,
    type EorStatus,
} from "../features/documents/sendings";
import { DocumentsTransportFilter, isDocumentsTransportFilterVisible } from "../features/documents";
import {
    useDocumentsClaims,
    DocumentsClaimsSection,
    ClaimsToolbarFilters,
    ClaimsCreateActionButton,
} from "../features/documents/claims";
import { stripOoo } from "../lib/formatUtils";
import {
    type SanctionCheckResult,
} from "../lib/sanctions";
import { STATUS_MAP, getFilterKeyByStatus, BILL_STATUS_MAP } from "../lib/statusUtils";
import { buildCargoDepartureByNumber } from "../lib/transitDateTime";
import { buildCargoSumPaidByNumber } from "../../lib/invoiceAmounts.js";
import {
    collectUniqueCachedDocumentEdoLabels,
    collectUniqueInvoiceEdoTableLabels,
} from "../lib/edoStatus";
import {
    getDefaultWeekMonday,
    getWeekRange,
    getYearsList,
    getWeeksList,
    MONTH_NAMES,
    DEFAULT_DATE_FROM,
    DEFAULT_DATE_TO,
} from "../lib/dateUtils";
import {
    initSharedFilterSets,
    routeKeyToCargoLabel,
    saveSharedListFilters,
    sharedFromFilterSets,
    type CargoStatusFilterKey,
    type RouteFilterKey,
    type SharedBillStatusKey,
    type TypeFilterKey,
} from "../lib/sharedListFilters";
import { formatDateFilterButtonLabel, usePersistedDateFilter } from "../features/listWorkspace";
import type { AccountPermissions, AuthData, CargoItem, DateFilter, StatusFilter } from "../types";
import { useDocumentsDateRange } from "./useDocumentsDateRange";
import { useDocumentsDataLoad } from "./useDocumentsDataLoad";
import { useCargoTransportFilter, usePerevozki } from "../hooks/useApi";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import {
    buildCargoRouteByNumber,
    buildCargoStateByNumber,
    buildCargoSumByNumber,
    buildCargoTransportByNumber,
    buildDocsSummary,
    buildInvoicesSummary,
    buildSendingsTotalsByVehicle,
    buildTransportLinkedCargoNumbersInPeriod,
    collectInvoiceLinkedCargoNumbers,
    sendingRowMatchesTransportFilter,
    formatSendingMetricNum,
    parseSendingMetricNumber,
    getFirstCargoNumberFromInvoice,
    getSendingRowParcelMetrics,
    collectSendingFreightCargoNumbers,
    sendingRowInSelectedPeriod,
    getActUpdEdoInfo,
} from "../features/documents/lib/documentsPipeline";
import {
    DocumentsSummaryCard,
    DocumentsStateBlocks,
} from "../features/documents/views/documentsViewBlocks";
import {
    cargoModeSwitchMotion,
    cargoSummaryMotion,
} from "./cargoMotion";

type DocSectionKey = 'Счета' | 'ЭДО' | 'УПД' | 'Заявки' | 'Отправки' | 'Претензии' | 'Договоры' | 'Акты сверок' | 'Тарифы';
const DOC_SECTIONS: { key: DocSectionKey; label: string }[] = [
    { key: 'ЭДО', label: 'ЭДО' },
    { key: 'Счета', label: 'Счета' },
    { key: 'УПД', label: 'УПД' },
    { key: 'Заявки', label: 'Заявки' },
    { key: 'Отправки', label: 'Отправки' },
    { key: 'Претензии', label: 'Претензии' },
    { key: 'Договоры', label: 'Договоры' },
    { key: 'Акты сверок', label: 'Акты сверок' },
    { key: 'Тарифы', label: 'Тарифы' },
];

const DOC_SECTION_TO_PERMISSION: Record<Exclude<DocSectionKey, 'ЭДО'>, keyof AccountPermissions> = {
    'Счета': 'doc_invoices',
    'УПД': 'doc_acts',
    'Заявки': 'doc_orders',
    'Отправки': 'doc_sendings',
    'Претензии': 'doc_claims',
    'Договоры': 'doc_contracts',
    'Акты сверок': 'doc_acts_settlement',
    'Тарифы': 'doc_tariffs',
};

type DocumentsPageProps = {
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

export function DocumentsPage({ auth, documentsServiceSaasUi = false, useServiceRequest, activeInn, searchText, onOpenCargo, onOpenAisWithMmsi, onOpenChat, permissions, showSums = true, hasAnalytics = false, isSuperAdmin = false }: DocumentsPageProps) {
    const runtime = useAppRuntime();
    const effectiveServiceMode = useServiceRequest ?? runtime.useServiceRequest;
    const effectiveActiveInn = activeInn ?? runtime.activeInn;
    const effectiveSearchText = searchText ?? runtime.searchText;
    const showCustomerColumn = runtime.showCustomerColumn;
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
    const [expandedSendingRow, setExpandedSendingRow] = useState<string | null>(null);
    const [sendingsSummaryCollapsed, setSendingsSummaryCollapsed] = useState(false);
    /** Столбец EOR виден всем с правом haulz; менять значение могут только с правом eor или суперадмин */
    const showEorColumn = (permissions?.haulz === true) || isSuperAdmin;
    const canEditEor = (permissions?.eor === true) || isSuperAdmin;
    /** Плановую дату могут менять руководители подразделений, eor-редакторы и суперадмин */
    const canEditPlanDate = canEditEor || (permissions?.supervisor === true);
    const canRunSanctionsCheck = hasAnalytics === true;
    const canSelectSendingRows = canEditPlanDate || canRunSanctionsCheck;
    const {
        sendingsSortColumn,
        sendingsSortOrder,
        sendingsSummarySortColumn,
        sendingsSummarySortOrder,
        handleSendingsSort,
        handleSendingsSummarySort,
    } = useSendingsSortState();
    const [eorStatusMap, setEorStatusMap] = useState<Record<string, EorStatus[]>>({});
    const [sendingSanctionMap, setSendingSanctionMap] = useState<Record<string, SanctionCheckResult>>({});
    const [ferriesList, setFerriesList] = useState<{ id: number; name: string; mmsi: string }[]>([]);
    const [sendingsFerryMap, setSendingsFerryMap] = useState<Record<string, { ferry_id: number; ferry_name: string; eta: string | null }>>({});
    const [ferryEtaLoadingByRow, setFerryEtaLoadingByRow] = useState<Record<string, boolean>>({});
        id: number;
        docDate: string | null;
        docNumber: string;
        customerName: string;
        customerInn: string;
        cityFrom: string;
        cityTo: string;
        transportType: string;
        isDangerous: boolean;
        isVet: boolean;
        tariff: number | null;
    }[]>([]);
        id: number;
        docNumber: string;
        docDate: string | null;
        periodFrom: string | null;
        periodTo: string | null;
        customerName: string;
        customerInn: string;
        edoStatus?: string | null;
        data?: Record<string, unknown> | null;
    }[]>([]);
        id: number;
        docNumber: string;
        docDate: string | null;
        customerName: string;
        customerInn: string;
        title: string;
        edoStatus?: string | null;
        data?: Record<string, unknown> | null;
    }[]>([]);
        id: number;
        claimNumber: string;
        cargoNumber: string;
        claimType: string;
        description: string;
        requestedAmount: number | null;
        approvedAmount: number | null;
        status: ClaimStatusKey;
        customerCompanyName?: string;
        createdAt: string;
        updatedAt: string;
    }[]>([]);
        id: number;
        customerInn: string;
        contract: string;
        periodFrom: string;
        periodTo: string;
        status: 'pending' | 'edo_sent';
        createdAt: string;
    }[]>([]);
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
    useEffect(() => {
        setExpandedSendingRow(null);
    }, [docSection, dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);
    const [tableSortColumn, setTableSortColumn] = useState<'customer' | 'sum' | 'count'>('customer');
    const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
    const [innerTableSortColumn, setInnerTableSortColumn] = useState<'number' | 'date' | 'status' | 'sum' | 'paid' | 'balance' | 'deliveryStatus' | 'route'>('date');
    const [innerTableSortOrder, setInnerTableSortOrder] = useState<'asc' | 'desc'>('desc');
    const [sendingsDetailsView, setSendingsDetailsView] = useState<'general' | 'byCargo' | 'byCustomer'>('general');
    const [sendingsSummaryGroupBy, setSendingsSummaryGroupBy] = useState<'customer' | 'receiver'>('customer');
    const [transportFilter, setTransportFilter] = useState<string>('');
    const [transportSearchQuery, setTransportSearchQuery] = useState<string>('');
    const [isDeliveryStatusDropdownOpen, setIsDeliveryStatusDropdownOpen] = useState(false);
    const [isRouteCargoDropdownOpen, setIsRouteCargoDropdownOpen] = useState(false);
    const [isTransportDropdownOpen, setIsTransportDropdownOpen] = useState(false);
    const [isEdoStatusDropdownOpen, setIsEdoStatusDropdownOpen] = useState(false);
    const [isActCustomerDropdownOpen, setIsActCustomerDropdownOpen] = useState(false);
    useEffect(() => {
        setSelectedByCustomerSummaryKeys(new Set());
        setExpandedByCustomerKey(null);
        setByCustomerPlanDateOpen(false);
        setByCustomerPlanDateValue("");
        setByCustomerActionLoading(false);
        setByCustomerActionError(null);
        setByCustomerActionInfo(null);
        setSendingsSummaryGroupBy('customer');
    }, [expandedSendingRow, sendingsDetailsView]);
    const deliveryStatusButtonRef = useRef<HTMLDivElement | null>(null);
    const routeCargoButtonRef = useRef<HTMLDivElement | null>(null);
    const edoStatusButtonRef = useRef<HTMLDivElement | null>(null);
    const dateButtonRef = useRef<HTMLDivElement | null>(null);
    const customerButtonRef = useRef<HTMLDivElement | null>(null);
    const billStatusButtonRef = useRef<HTMLDivElement | null>(null);
    const routeButtonRef = useRef<HTMLDivElement | null>(null);
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const yearWasLongPressRef = useRef(false);
    const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const weekWasLongPressRef = useRef(false);

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
    const normalizeTransportDisplay = useCallback((value: unknown): string => {
        const s = String(value ?? '').toUpperCase().trim();
        if (!s) return '';
        const normalizedSpaces = s.replace(/\s+/g, ' ');
        const container = normalizedSpaces.match(/([A-ZА-Я]{4})[\s\-]*([0-9]{7})$/u);
        if (container) return `${container[1]} ${container[2]}`;
        const vehicle = normalizedSpaces.match(/([A-ZА-Я][0-9]{3}[A-ZА-Я]{2})(\s*\/?\s*([0-9]{2,3}))?$/u);
        if (vehicle) {
            const base = vehicle[1];
            const region = vehicle[3] ?? '';
            if (!region) return base;
            return `${base}${region}`;
        }
        const looseVehicle = normalizedSpaces.match(/([A-ZА-Я])[\s\-]*([0-9]{3})[\s\-]*([A-ZА-Я]{2})(?:[\s\-]*\/?[\s\-]*([0-9]{2,3}))?$/u);
        if (looseVehicle) {
            const base = `${looseVehicle[1]}${looseVehicle[2]}${looseVehicle[3]}`;
            const region = looseVehicle[4] ?? '';
            if (!region) return base;
            return `${base}${region}`;
        }
        return normalizedSpaces
            .replace(/\bнаименование\s*тс\b[:\-]?\s*/giu, '')
            .replace(/\bконтейнер\b[:\-]?\s*/giu, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }, []);
    const parseDateTimeValue = useCallback((value: unknown): Date | null => {
        const source = String(value ?? '').trim();
        if (!source) return null;
        const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/);
        if (iso) {
            const year = Number(iso[1]);
            const month = Number(iso[2]) - 1;
            const day = Number(iso[3]);
            const hours = Number(iso[4] ?? 0);
            const minutes = Number(iso[5] ?? 0);
            const seconds = Number(iso[6] ?? 0);
            const date = new Date(year, month, day, hours, minutes, seconds);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        const ru = source.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,T](\d{2})(?::(\d{2}))?(?::(\d{2}))?)?/);
        if (ru) {
            const day = Number(ru[1]);
            const month = Number(ru[2]) - 1;
            const year = Number(ru[3]);
            const hours = Number(ru[4] ?? 0);
            const minutes = Number(ru[5] ?? 0);
            const seconds = Number(ru[6] ?? 0);
            const date = new Date(year, month, day, hours, minutes, seconds);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        const fallback = new Date(source);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }, []);
    const cargoStopDateByNumber = useMemo(() => {
        const m = new Map<string, Date>();
        (perevozkiItems || []).forEach((cargo: any) => {
            const raw = String(
                cargo?.Number
                ?? cargo?.number
                ?? cargo?.Номер
                ?? cargo?.НомерПеревозки
                ?? cargo?.CargoNumber
                ?? cargo?.NumberPerevozki
                ?? '',
            ).replace(/^0000-/, '').trim();
            if (!raw) return;
            const statusKey = getFilterKeyByStatus(String(cargo?.State ?? cargo?.state ?? cargo?.Статус ?? cargo?.Status ?? ''));
            // Таймер останавливается на «Готов к выдаче»; «Доставлено» — финальная точка, если ready не было
            if (statusKey !== 'ready' && statusKey !== 'delivered') return;
            const stopDate = parseDateTimeValue(
                cargo?.StatusDate
                ?? cargo?.DateStatus
                ?? cargo?.DateState
                ?? cargo?.UpdatedAt
                ?? cargo?.updated_at
                ?? cargo?.ДатаСтатуса
                ?? cargo?.ДатаИзменения
                ?? cargo?.DateVr
                ?? cargo?.DatePrih
                ?? cargo?.DateDelivery
                ?? cargo?.DeliveryDate
                ?? cargo?.ДатаДоставки
                ?? cargo?.ДатаПрибытия
                ?? cargo?.Дата
            );
            if (!stopDate) return;
            const key = normCargoKey(raw);
            const prev = m.get(key);
            if (!prev || stopDate.getTime() < prev.getTime()) m.set(key, stopDate);
            if (key !== raw) {
                const prevRaw = m.get(raw);
                if (!prevRaw || stopDate.getTime() < prevRaw.getTime()) m.set(raw, stopDate);
            }
        });
        return m;
    }, [perevozkiItems, parseDateTimeValue, normCargoKey]);
    const cargoDepartureByNumber = useMemo(
        () => buildCargoDepartureByNumber(perevozkiItems || [], normCargoKey),
        [perevozkiItems, normCargoKey],
    );
    const cargoPlanDateByNumber = useMemo(() => {
        const m = new Map<string, Date>();
        const plannedKeys = [
            'DateArrival', 'PlannedDeliveryDate', 'PlanDeliveryDate', 'DateDeliveryPlan',
            'ПлановаяДатаДоставки', 'ПланДатаДоставки', 'ПлановаяДата', 'PlanDate',
            'ДатаПрибытияПлан', 'ДатаДоставкиПлан', 'ПланДатаПрибытия', 'ПлановаяДатаПрибытия',
            'DateVrPlan', 'DatePrihPlan', 'ДатаПлан',
        ];
        (perevozkiItems || []).forEach((c: any) => {
            const raw = String(c?.Number ?? c?.number ?? c?.Номер ?? c?.НомерПеревозки ?? c?.CargoNumber ?? c?.NumberPerevozki ?? '').replace(/^0000-/, '').trim();
            if (!raw) return;
            let date: Date | null = null;
            for (const k of plannedKeys) {
                const v = c?.[k];
                const parsed = parseDateTimeValue(v);
                if (parsed) {
                    date = date ? (parsed.getTime() < date.getTime() ? parsed : date) : parsed;
                }
            }
            if (date && date.getFullYear() >= 1990) {
                const key = normCargoKey(raw);
                const prev = m.get(key);
                if (!prev || date.getTime() < prev.getTime()) m.set(key, date);
                if (key !== raw) {
                    const prevRaw = m.get(raw);
                    if (!prevRaw || date.getTime() < prevRaw.getTime()) m.set(raw, date);
                }
            }
        });
        return m;
    }, [perevozkiItems, parseDateTimeValue, normCargoKey]);
    /** Ближайшая плановая дата вложений (перевозок) по идентификатору отправки — для строк без посылок */
    const sendingPlanDateBySendingId = useMemo(() => {
        const m = new Map<string, Date>();
        const plannedKeys = [
            'DateArrival', 'PlannedDeliveryDate', 'PlanDeliveryDate', 'DateDeliveryPlan',
            'ПлановаяДатаДоставки', 'ПланДатаДоставки', 'ПлановаяДата', 'PlanDate',
            'ДатаПрибытияПлан', 'ДатаДоставкиПлан', 'ПланДатаПрибытия', 'ПлановаяДатаПрибытия',
            'DateVrPlan', 'DatePrihPlan', 'ДатаПлан',
        ];
        const addForId = (id: string, date: Date) => {
            if (!id || !date || date.getFullYear() < 1990) return;
            const key = normCargoKey(id);
            const prev = m.get(key);
            if (!prev || date.getTime() < prev.getTime()) m.set(key, date);
        };
        (perevozkiItems || []).forEach((c: any) => {
            let date: Date | null = null;
            for (const k of plannedKeys) {
                const v = c?.[k];
                const parsed = parseDateTimeValue(v);
                if (parsed) date = date ? (parsed.getTime() < date.getTime() ? parsed : date) : parsed;
            }
            if (!date || date.getFullYear() < 1990) return;
            const sendingIds = [
                c?.ИДОтправления ?? c?.IdOtpravleniya ?? c?.SendingId ?? c?.Отправка ?? c?.ОтправкаНаименование,
                c?.Number ?? c?.number ?? c?.Номер ?? c?.НомерПеревозки ?? c?.CargoNumber ?? c?.NumberPerevozki,
            ].filter((v) => v != null && String(v).trim());
            sendingIds.forEach((id) => addForId(String(id).trim(), date!));
        });
        return m;
    }, [perevozkiItems, parseDateTimeValue, normCargoKey]);
    const getSendingStatusKey = useSendingsStatusKeyResolver({ cargoStateByNumber, normCargoKey });
    const cargoCustomerByNumber = useMemo(() => {
        const m = new Map<string, string>();
        (perevozkiItems || []).forEach((c: any) => {
            const raw = String(c?.Number ?? c?.number ?? '').replace(/^0000-/, '').trim();
            if (!raw) return;
            const key = normCargoKey(raw);
            const customer = String(c?.Customer ?? c?.customer ?? c?.Заказчик ?? c?.Контрагент ?? c?.Contractor ?? c?.Organization ?? '').trim();
            if (!customer) return;
            m.set(key, customer);
            if (key !== raw) m.set(raw, customer);
        });
        return m;
    }, [perevozkiItems, normCargoKey]);
    const cargoReceiverByNumber = useMemo(() => {
        const m = new Map<string, string>();
        (perevozkiItems || []).forEach((c: any) => {
            const raw = String(c?.Number ?? c?.number ?? '').replace(/^0000-/, '').trim();
            if (!raw) return;
            const key = normCargoKey(raw);
            const receiver = String(c?.Получатель ?? c?.Грузополучатель ?? c?.Receiver ?? c?.receiver ?? c?.Consignee ?? '').trim();
            if (!receiver) return;
            m.set(key, receiver);
            if (key !== raw) m.set(raw, receiver);
        });
        return m;
    }, [perevozkiItems, normCargoKey]);

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
    const uniqueSendingCustomers = useMemo(() => [...new Set((sendingsItems || []).map((i: any) => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim())).filter(Boolean))].sort(), [sendingsItems]);

    const uniqueActCustomers = actsCatalog.uniqueActCustomers;
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

    const {
        transportOptionsCurrentSection,
        filteredSendings,
    } = useSendingsBaseFilter({
        sendingsItems: sendingsItems || [],
        sendingsLoading,
        effectiveActiveInn,
        customerFilter,
        typeFilterSet,
        routeFilterSet,
        effectiveSearchText,
        sortBy,
        sortOrder,
        normalizeTransportDisplay,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        transportFilter,
        transportLinkedCargoNumbers,
        setTransportFilter,
    });

    const sendingsRowRuntime = useSendingsRowRuntime({
        filteredSendings,
        normCargoKey,
        parseDateTimeValue,
        normalizeTransportDisplay,
        cargoStateByNumber,
        cargoStopDateByNumber,
        cargoDepartureByNumber,
        cargoPlanDateByNumber,
        sendingPlanDateBySendingId,
    });
    const { getSendingTransitHours, getSendingTransitIsFinal } = sendingsRowRuntime;

    const {
        sendingRowsSorted,
        sendingsInfographic,
        sendingsTableTotals,
        sendingsRepeatedVehicleTotals,
        sendingsVehicleGrandTotals,
    } = useSendingsListPipeline({
        filteredSendings,
        deliveryStatusFilterSet,
        getSendingStatusKey,
        sendingsSortColumn,
        sendingsSortOrder,
        normalizeTransportDisplay,
        getSendingTransitHours,
        cargoSumByNumber,
        hasAnalytics,
    });
    const sendingsInitialLoading = sendingsLoading && (sendingsItems?.length ?? 0) === 0;
    const sendingsSummary = useMemo(() => buildDocsSummary(filteredSendings), [filteredSendings]);

    const handleTableSort = (column: 'customer' | 'sum' | 'count') => {
        if (tableSortColumn === column) setTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setTableSortColumn(column); setTableSortOrder('asc'); }
    };

    const handleInnerTableSort = (column: 'number' | 'date' | 'status' | 'sum' | 'paid' | 'balance' | 'deliveryStatus' | 'route') => {
        if (innerTableSortColumn === column) setInnerTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setInnerTableSortColumn(column); setInnerTableSortOrder(column === 'date' ? 'desc' : 'asc'); }
    };

    const tableModeEffective = tableModeByCustomer;
    const visibleSendingMeta = useSendingsVisibleMeta(sendingRowsSorted);
    const {
        selectedSendingRowKeys,
        setSelectedSendingRowKeys,
        bulkEorMenuOpen,
        setBulkEorMenuOpen,
        bulkPlanDateOpen,
        setBulkPlanDateOpen,
        bulkPlanDateValue,
        setBulkPlanDateValue,
        bulkSendingActionLoading,
        bulkSendingActionError,
        bulkSendingActionInfo,
        selectedByCustomerSummaryKeys,
        setSelectedByCustomerSummaryKeys,
        byCustomerPlanDateOpen,
        setByCustomerPlanDateOpen,
        byCustomerPlanDateValue,
        setByCustomerPlanDateValue,
        byCustomerActionLoading,
        setByCustomerActionLoading,
        byCustomerActionError,
        setByCustomerActionError,
        byCustomerActionInfo,
        setByCustomerActionInfo,
        expandedByCustomerKey,
        setExpandedByCustomerKey,
        selectedVisibleSendingCount,
        allVisibleSendingsSelected,
        applyBulkSanctionsCheck,
        applyBulkEorStatus,
        applyBulkPlanDate,
        applyByCustomerPlanDate,
        resetBulkUiState,
    } = useSendingsBulkActions({
        visibleSendingMeta,
        canRunSanctionsCheck,
        canEditEor,
        canEditPlanDate,
        getSendingSanctionResult,
        setEorStatusMap,
        setSendingSanctionMap,
        auth,
        effectiveActiveInn,
    });
    const {
        sendingsFerryActionError,
        getSendingsFerryEntry,
        handleFerrySelect,
        resetFerryUiState,
    } = useSendingsFerryActions({
        auth,
        ferriesList,
        sendingsFerryMap,
        setSendingsFerryMap,
        setFerryEtaLoadingByRow,
        effectiveActiveInn,
    });
    const resetSendingsUiState = useCallback(() => {
        resetBulkUiState();
        resetFerryUiState();
    }, [resetBulkUiState, resetFerryUiState]);
    useSendingsServerSync({
        docSection,
        showEorColumn,
        auth,
        setEorStatusMap,
        setFerriesList,
        setSendingsFerryMap,
        resetSendingsUiState,
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
    const closeDocumentsToolbarDropdownsForClaims = useCallback(() => {
        setIsDateDropdownOpen(false);
        setIsCustomerDropdownOpen(false);
        ordersCatalog.setIsReceiverDropdownOpen(false);
        setIsActCustomerDropdownOpen(false);
        setIsTypeDropdownOpen(false);
        setIsRouteDropdownOpen(false);
        setIsDeliveryStatusDropdownOpen(false);
        setIsRouteCargoDropdownOpen(false);
        setIsEdoStatusDropdownOpen(false);
        setIsTransportDropdownOpen(false);
    }, [ordersCatalog]);

    const sendingsSectionProps = useSendingsSectionProps({
        tableModeEffective: tableModeEffective,
        docsMotionEnabled: docsMotionEnabled,
        cargoModeSwitchMotion: cargoModeSwitchMotion,
        canSelectSendingRows: canSelectSendingRows,
        allVisibleSendingsSelected: allVisibleSendingsSelected,
        visibleSendingMeta: visibleSendingMeta,
        setSelectedSendingRowKeys: setSelectedSendingRowKeys,
        selectedSendingRowKeys: selectedSendingRowKeys,
        handleSendingsSort: handleSendingsSort,
        sendingsSortColumn: sendingsSortColumn,
        sendingsSortOrder: sendingsSortOrder,
        hasAnalytics: hasAnalytics,
        showSums: showSums,
        showEorColumn: showEorColumn,
        canEditEor: canEditEor,
        canEditPlanDate: canEditPlanDate,
        canRunSanctionsCheck: canRunSanctionsCheck,
        sendingRowsSorted: sendingRowsSorted,
        sendingsRowRuntime: sendingsRowRuntime,
        normalizeTransportDisplay: normalizeTransportDisplay,
        effectiveSearchText: effectiveSearchText,
        expandedSendingRow: expandedSendingRow,
        setExpandedSendingRow: setExpandedSendingRow,
        cargoSumByNumber: cargoSumByNumber,
        sendingSanctionMap: sendingSanctionMap,
        eorStatusMap: eorStatusMap,
        ferriesList: ferriesList,
        sendingsFerryMap: sendingsFerryMap,
        ferryEtaLoadingByRow: ferryEtaLoadingByRow,
        handleFerrySelect: handleFerrySelect,
        effectiveActiveInn: effectiveActiveInn,
        getSendingsFerryEntry: getSendingsFerryEntry,
        onOpenAisWithMmsi: onOpenAisWithMmsi,
        onOpenCargo: onOpenCargo,
        perevozkiItems: perevozkiItems,
        sendingsDetailsView: sendingsDetailsView,
        setSendingsDetailsView: setSendingsDetailsView,
        sendingsSummaryGroupBy: sendingsSummaryGroupBy,
        setSendingsSummaryGroupBy: setSendingsSummaryGroupBy,
        sendingsSummarySortColumn: sendingsSummarySortColumn,
        sendingsSummarySortOrder: sendingsSummarySortOrder,
        handleSendingsSummarySort: handleSendingsSummarySort,
        cargoStateByNumber: cargoStateByNumber,
        cargoPlanDateByNumber: cargoPlanDateByNumber,
        cargoReceiverByNumber: cargoReceiverByNumber,
        cargoCustomerByNumber: cargoCustomerByNumber,
        showCustomerColumn: showCustomerColumn,
        effectiveServiceMode: effectiveServiceMode,
        selectedByCustomerSummaryKeys: selectedByCustomerSummaryKeys,
        setSelectedByCustomerSummaryKeys: setSelectedByCustomerSummaryKeys,
        expandedByCustomerKey: expandedByCustomerKey,
        setExpandedByCustomerKey: setExpandedByCustomerKey,
        byCustomerPlanDateOpen: byCustomerPlanDateOpen,
        setByCustomerPlanDateOpen: setByCustomerPlanDateOpen,
        byCustomerPlanDateValue: byCustomerPlanDateValue,
        setByCustomerPlanDateValue: setByCustomerPlanDateValue,
        byCustomerActionLoading: byCustomerActionLoading,
        setByCustomerActionLoading: setByCustomerActionLoading,
        byCustomerActionError: byCustomerActionError,
        setByCustomerActionError: setByCustomerActionError,
        byCustomerActionInfo: byCustomerActionInfo,
        setByCustomerActionInfo: setByCustomerActionInfo,
        selectedVisibleSendingCount: selectedVisibleSendingCount,
        bulkSendingActionLoading: bulkSendingActionLoading,
        bulkEorMenuOpen: bulkEorMenuOpen,
        setBulkEorMenuOpen: setBulkEorMenuOpen,
        bulkPlanDateOpen: bulkPlanDateOpen,
        setBulkPlanDateOpen: setBulkPlanDateOpen,
        bulkPlanDateValue: bulkPlanDateValue,
        setBulkPlanDateValue: setBulkPlanDateValue,
        bulkSendingActionError: bulkSendingActionError,
        bulkSendingActionInfo: bulkSendingActionInfo,
        applyBulkEorStatus: applyBulkEorStatus,
        applyBulkPlanDate: applyBulkPlanDate,
        applyBulkSanctionsCheck: applyBulkSanctionsCheck,
        auth: auth,
        applyByCustomerPlanDate: applyByCustomerPlanDate,
    });

    return (
        <div className={`w-full documents-page${documentsServiceSaasUi ? " documents-page--saas-analytics" : ""}${(docSection === 'Счета' || docSection === 'УПД') ? " documents-page--with-summary-sections" : ""}${docSection === 'ЭДО' ? " documents-page--with-edo-section" : ""}${docSection === 'Заявки' ? " documents-page--with-orders-section" : ""}${docSection === 'Отправки' ? " documents-page--with-sendings-section" : ""}${docSection === 'Тарифы' ? " documents-page--with-tariffs-section" : ""}${docSection === 'Договоры' ? " documents-page--with-contracts-section" : ""}${docSection === 'Акты сверок' ? " documents-page--with-sverki-section" : ""}`} style={{ minWidth: 0, maxWidth: '100%' }}>
            <div className="cargo-page-sticky-header documents-page-sticky-header">
                <Flex align="center" justify="space-between" style={{ marginBottom: '0.3rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <Typography.Headline className="text-page-title">Документы</Typography.Headline>
                    <Flex align="center" gap="0.5rem" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        {effectiveServiceMode && serviceRefreshKindsForDocumentsSection(docSection).length > 0 ? (
                            <ServiceRefreshFrom1cButton
                                auth={auth}
                                dateFrom={apiDateRange.dateFrom}
                                dateTo={apiDateRange.dateTo}
                                kinds={serviceRefreshKindsForDocumentsSection(docSection)}
                                compact
                                onRefreshed={async () => {
                                    const kinds = serviceRefreshKindsForDocumentsSection(docSection);
                                    if (kinds.includes("invoices")) await mutateInvoices(undefined, { revalidate: true });
                                    if (kinds.includes("perevozki")) await mutatePerevozki(undefined, { revalidate: true });
                                    if (kinds.includes("acts")) await mutateActs(undefined, { revalidate: true });
                                    if (kinds.includes("orders")) await mutateOrders(undefined, { revalidate: true });
                                    if (kinds.includes("sendings")) await mutateSendings(undefined, { revalidate: true });
                                }}
                            />
                        ) : null}
                        <Typography.Body style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Таблица</Typography.Body>
                        <span className="roles-switch-wrap" style={{ display: 'inline-flex' }} aria-label={tableModeByCustomer ? 'Показать карточки' : 'Показать таблицу'}>
                            <TapSwitch checked={tableModeByCustomer} onToggle={() => setTableModeByCustomer(v => !v)} />
                        </span>
                    </Flex>
                </Flex>
                {/* Кнопки разделов: ниже «Документы», выше фильтров */}
                <div className="documents-sticky-body">
                <div className="doc-sections-row">
                    <Flex align="center" gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                        {allowedDocSections.map(({ key, label }) => {
                            const isActive = docSection === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    className={isActive ? 'doc-section-tab doc-section-tab--active' : 'doc-section-tab'}
                                    onClick={() => setDocSection(key)}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </Flex>
                </div>
                {(docSection === 'Счета' || docSection === 'ЭДО' || docSection === 'УПД' || docSection === 'Заявки' || docSection === 'Отправки' || docSection === 'Тарифы' || docSection === 'Акты сверок' || docSection === 'Договоры' || docSection === 'Претензии') && (
                <div className="filters-container filters-row-scroll">
                    <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                        {docSection !== 'Тарифы' && docSection !== 'Договоры' ? (
                            <Button className="filter-button" style={{ padding: '0.5rem', minWidth: 'auto' }} onClick={() => { setSortBy('date'); setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); }} title={sortOrder === 'desc' ? 'Дата по убыванию' : 'Дата по возрастанию'}>
                                {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                            </Button>
                        ) : null}
                        {docSection !== 'Договоры' ? (
                        <>
                        <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsCustomerDropdownOpen(false); ordersCatalog.setIsReceiverDropdownOpen(false); setIsActCustomerDropdownOpen(false); sverkiCatalog.closeSverkiDropdowns(); dogovorsCatalog.closeDogovorsDropdowns(); claimsCatalog.closeClaimsDropdowns(); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); tariffsCatalog.closeTariffsDropdowns(); }}>
                                Дата: {formatDateFilterButtonLabel({
                                    dateFilter,
                                    apiDateRange,
                                    selectedMonthForFilter,
                                    selectedYearForFilter,
                                    selectedWeekForFilter,
                                })} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={dateButtonRef} isOpen={isDateDropdownOpen} onClose={() => setIsDateDropdownOpen(false)}>
                            {dateDropdownMode === 'months' ? (
                                <>
                                    <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                    {MONTH_NAMES.map((name, i) => (
                                        <div key={i} className="dropdown-item" onClick={() => { setDateFilter('месяц'); setSelectedMonthForFilter({ year: new Date().getFullYear(), month: i + 1 }); setIsDateDropdownOpen(false); setDateDropdownMode('main'); }}>
                                            <Typography.Body>{name} {new Date().getFullYear()}</Typography.Body>
                                        </div>
                                    ))}
                                </>
                            ) : dateDropdownMode === 'years' ? (
                                <>
                                    <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                    {getYearsList(6).map(y => (
                                        <div key={y} className="dropdown-item" onClick={() => { setDateFilter('год'); setSelectedYearForFilter(y); setIsDateDropdownOpen(false); setDateDropdownMode('main'); }}>
                                            <Typography.Body>{y}</Typography.Body>
                                        </div>
                                    ))}
                                </>
                            ) : dateDropdownMode === 'weeks' ? (
                                <>
                                    <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                    {getWeeksList(16).map(w => (
                                        <div key={w.monday} className="dropdown-item" onClick={() => { setDateFilter('неделя'); setSelectedWeekForFilter(w.monday); setIsDateDropdownOpen(false); setDateDropdownMode('main'); }}>
                                            <Typography.Body>{w.label}</Typography.Body>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                ['сегодня', 'вчера', 'неделя', 'месяц', 'год', 'период'].map(key => {
                                    const isMonth = key === 'месяц';
                                    const isYear = key === 'год';
                                    const isWeek = key === 'неделя';
                                    const doLongPress = isMonth || isYear || isWeek;
                                    const timerRef = isMonth ? monthLongPressTimerRef : isYear ? yearLongPressTimerRef : weekLongPressTimerRef;
                                    const wasLongPressRef = isMonth ? monthWasLongPressRef : isYear ? yearWasLongPressRef : weekWasLongPressRef;
                                    const mode = isMonth ? 'months' : isYear ? 'years' : 'weeks';
                                    const title = isMonth ? 'Клик — текущий месяц; удерживайте — выбор месяца' : isYear ? 'Клик — 365 дней; удерживайте — выбор года' : isWeek ? 'Клик — последние 7 дней; удерживайте — выбор недели (пн–вс)' : undefined;
                                    return (
                                        <div key={key} className="dropdown-item" title={title}
                                            onPointerDown={doLongPress ? () => { wasLongPressRef.current = false; timerRef.current = setTimeout(() => { timerRef.current = null; wasLongPressRef.current = true; setDateDropdownMode(mode); }, 500); } : undefined}
                                            onPointerUp={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                            onPointerLeave={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                            onClick={() => {
                                                if (doLongPress && wasLongPressRef.current) { wasLongPressRef.current = false; return; }
                                                if (key === 'период') {
                                                    let r: { dateFrom: string; dateTo: string };
                                                    if (dateFilter === "период") { r = { dateFrom: customDateFrom, dateTo: customDateTo }; }
                                                    else if (dateFilter === "месяц" && selectedMonthForFilter) {
                                                        const { year, month } = selectedMonthForFilter;
                                                        const pad = (n: number) => String(n).padStart(2, '0');
                                                        const lastDay = new Date(year, month, 0).getDate();
                                                        r = { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                                                    } else if (dateFilter === "год" && selectedYearForFilter) {
                                                        r = { dateFrom: `${selectedYearForFilter}-01-01`, dateTo: `${selectedYearForFilter}-12-31` };
                                                    } else if (dateFilter === "неделя" && selectedWeekForFilter) {
                                                        r = getWeekRange(selectedWeekForFilter);
                                                    } else { r = getDateRange(dateFilter); }
                                                    setCustomDateFrom(r.dateFrom);
                                                    setCustomDateTo(r.dateTo);
                                                }
                                                setDateFilter(key as DateFilter);
                                                if (key === 'месяц') setSelectedMonthForFilter(null);
                                                if (key === 'год') setSelectedYearForFilter(null);
                                                if (key === 'неделя') setSelectedWeekForFilter(null);
                                                setIsDateDropdownOpen(false);
                                                if (key === 'период') setIsCustomModalOpen(true);
                                            }}>
                                            <Typography.Body>{key === 'год' ? 'Год' : key === 'период' ? 'Период' : key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                        </div>
                                    );
                                })
                            )}
                        </FilterDropdownPortal>
                        </>
                        ) : null}
                        {docSection === 'Тарифы' && (
                            <DocumentsTariffsToolbarFilters
                                effectiveServiceMode={effectiveServiceMode}
                                tariffsCustomerFilter={tariffsCatalog.tariffsCustomerFilter}
                                setTariffsCustomerFilter={tariffsCatalog.setTariffsCustomerFilter}
                                tariffsCustomerSearchQuery={tariffsCatalog.tariffsCustomerSearchQuery}
                                setTariffsCustomerSearchQuery={tariffsCatalog.setTariffsCustomerSearchQuery}
                                tariffsRouteFilter={tariffsCatalog.tariffsRouteFilter}
                                setTariffsRouteFilter={tariffsCatalog.setTariffsRouteFilter}
                                tariffsTypeFilter={tariffsCatalog.tariffsTypeFilter}
                                setTariffsTypeFilter={tariffsCatalog.setTariffsTypeFilter}
                                uniqueTariffsCustomers={tariffsCatalog.uniqueTariffsCustomers}
                                uniqueTariffsRoutes={tariffsCatalog.uniqueTariffsRoutes}
                                uniqueTariffsTypes={tariffsCatalog.uniqueTariffsTypes}
                                isTariffsCustomerDropdownOpen={tariffsCatalog.isTariffsCustomerDropdownOpen}
                                setIsTariffsCustomerDropdownOpen={tariffsCatalog.setIsTariffsCustomerDropdownOpen}
                                isTariffsRouteDropdownOpen={tariffsCatalog.isTariffsRouteDropdownOpen}
                                setIsTariffsRouteDropdownOpen={tariffsCatalog.setIsTariffsRouteDropdownOpen}
                                isTariffsTypeDropdownOpen={tariffsCatalog.isTariffsTypeDropdownOpen}
                                setIsTariffsTypeDropdownOpen={tariffsCatalog.setIsTariffsTypeDropdownOpen}
                                onCloseOtherDropdowns={closeDocumentsToolbarDropdownsExceptSendings}
                            />
                        )}
                        {(docSection === 'Счета' || docSection === 'ЭДО' || docSection === 'Заявки') && effectiveServiceMode && (                        {(docSection === 'Счета' || docSection === 'ЭДО' || docSection === 'Заявки') && effectiveServiceMode && (
                            <>
                                <div ref={customerButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsCustomerDropdownOpen(!isCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Заказчик: {customerFilter ? stripOoo(customerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={customerButtonRef} isOpen={isCustomerDropdownOpen} onClose={() => setIsCustomerDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setCustomerFilter(''); setIsCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {(docSection === 'Заявки' ? ordersCatalog.uniqueOrderCustomers : docSection === 'Отправки' ? uniqueSendingCustomers : uniqueCustomers).map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setCustomerFilter(c); setIsCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {docSection === 'Заявки' && (
                            <DocumentsOrdersToolbarFilters
                                orderReceiverFilter={ordersCatalog.orderReceiverFilter}
                                setOrderReceiverFilter={ordersCatalog.setOrderReceiverFilter}
                                orderSenderFilter={ordersCatalog.orderSenderFilter}
                                setOrderSenderFilter={ordersCatalog.setOrderSenderFilter}
                                orderRouteFilter={ordersCatalog.orderRouteFilter}
                                setOrderRouteFilter={ordersCatalog.setOrderRouteFilter}
                                uniqueOrderReceivers={ordersCatalog.uniqueOrderReceivers}
                                uniqueOrderSenders={ordersCatalog.uniqueOrderSenders}
                                uniqueOrderRoutes={ordersCatalog.uniqueOrderRoutes}
                                isReceiverDropdownOpen={ordersCatalog.isReceiverDropdownOpen}
                                setIsReceiverDropdownOpen={ordersCatalog.setIsReceiverDropdownOpen}
                                isOrderSenderDropdownOpen={ordersCatalog.isOrderSenderDropdownOpen}
                                setIsOrderSenderDropdownOpen={ordersCatalog.setIsOrderSenderDropdownOpen}
                                isOrderRouteDropdownOpen={ordersCatalog.isOrderRouteDropdownOpen}
                                setIsOrderRouteDropdownOpen={ordersCatalog.setIsOrderRouteDropdownOpen}
                                onCloseOtherDropdowns={closeDocumentsToolbarDropdownsExceptSendings}
                            />
                        )}
                        {docSection === 'Отправки' && (                        {docSection === 'Отправки' && (
                            <SendingsToolbarFilters
                                transportFilter={transportFilter}
                                setTransportFilter={setTransportFilter}
                                transportOptionsCurrentSection={transportOptionsCurrentSection}
                                typeFilterSet={typeFilterSet}
                                setTypeFilterSet={setTypeFilterSet}
                                routeFilterSet={routeFilterSet}
                                setRouteFilterSet={setRouteFilterSet}
                                deliveryStatusFilterSet={deliveryStatusFilterSet}
                                setDeliveryStatusFilterSet={setDeliveryStatusFilterSet}
                                isTypeDropdownOpen={isTypeDropdownOpen}
                                setIsTypeDropdownOpen={setIsTypeDropdownOpen}
                                isRouteCargoDropdownOpen={isRouteCargoDropdownOpen}
                                setIsRouteCargoDropdownOpen={setIsRouteCargoDropdownOpen}
                                isDeliveryStatusDropdownOpen={isDeliveryStatusDropdownOpen}
                                setIsDeliveryStatusDropdownOpen={setIsDeliveryStatusDropdownOpen}
                                closeOtherDropdowns={closeDocumentsToolbarDropdownsExceptSendings}
                            />
                        )}
                        {docSection === 'УПД' && (
                            <DocumentsActsToolbarFilters
                                effectiveServiceMode={effectiveServiceMode}
                                actCustomerFilter={actCustomerFilter}
                                setActCustomerFilter={setActCustomerFilter}
                                uniqueActCustomers={actsCatalog.uniqueActCustomers}
                                isActCustomerDropdownOpen={isActCustomerDropdownOpen}
                                setIsActCustomerDropdownOpen={setIsActCustomerDropdownOpen}
                                onCloseOtherDropdowns={closeDocumentsToolbarDropdownsExceptSendings}
                            />
                        )}
                        {docSection === 'Акты сверок' && (
                            <DocumentsSverkiToolbarFilters
                                effectiveServiceMode={effectiveServiceMode}
                                sverkiCustomerFilter={sverkiCatalog.sverkiCustomerFilter}
                                setSverkiCustomerFilter={sverkiCatalog.setSverkiCustomerFilter}
                                uniqueSverkiCustomers={sverkiCatalog.uniqueSverkiCustomers}
                                isSverkiCustomerDropdownOpen={sverkiCatalog.isSverkiCustomerDropdownOpen}
                                setIsSverkiCustomerDropdownOpen={sverkiCatalog.setIsSverkiCustomerDropdownOpen}
                                onCloseOtherDropdowns={closeDocumentsToolbarDropdownsExceptSendings}
                            />
                        )}
                        {docSection === 'Договоры' && (
                            <DocumentsDogovorsToolbarFilters
                                effectiveServiceMode={effectiveServiceMode}
                                dogovorsCustomerFilter={dogovorsCatalog.dogovorsCustomerFilter}
                                setDogovorsCustomerFilter={dogovorsCatalog.setDogovorsCustomerFilter}
                                uniqueDogovorsCustomers={dogovorsCatalog.uniqueDogovorsCustomers}
                                isDogovorsCustomerDropdownOpen={dogovorsCatalog.isDogovorsCustomerDropdownOpen}
                                setIsDogovorsCustomerDropdownOpen={dogovorsCatalog.setIsDogovorsCustomerDropdownOpen}
                                onCloseOtherDropdowns={closeDocumentsToolbarDropdownsExceptSendings}
                            />
                        )}
                        {docSection === 'Претензии' && (                        {docSection === 'Претензии' && (
                            <ClaimsToolbarFilters
                                effectiveServiceMode={effectiveServiceMode}
                                claimsStatusFilter={claimsCatalog.claimsStatusFilter}
                                setClaimsStatusFilter={claimsCatalog.setClaimsStatusFilter}
                                claimsCustomerFilter={claimsCatalog.claimsCustomerFilter}
                                setClaimsCustomerFilter={claimsCatalog.setClaimsCustomerFilter}
                                uniqueClaimsCustomers={claimsCatalog.uniqueClaimsCustomers}
                                isClaimsStatusDropdownOpen={claimsCatalog.isClaimsStatusDropdownOpen}
                                setIsClaimsStatusDropdownOpen={claimsCatalog.setIsClaimsStatusDropdownOpen}
                                isClaimsCustomerDropdownOpen={claimsCatalog.isClaimsCustomerDropdownOpen}
                                setIsClaimsCustomerDropdownOpen={claimsCatalog.setIsClaimsCustomerDropdownOpen}
                                closeOtherDropdowns={claimsCatalog.closeClaimsDropdowns}
                            />
                        )}
                        {(docSection === 'Счета' || docSection === 'ЭДО' || docSection === 'УПД' || docSection === 'Договоры' || docSection === 'Акты сверок') && (
                        <>
                        <div ref={edoStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsEdoStatusDropdownOpen(!isEdoStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsTransportDropdownOpen(false); edoCatalog.setIsEdoCounterpartyDropdownOpen(false); }}>
                                Статус ЭДО: {edoStatusFilterSet.size === 0 ? 'Все' : edoStatusFilterSet.size === 1 ? [...edoStatusFilterSet][0] : `Выбрано: ${edoStatusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={edoStatusButtonRef} isOpen={isEdoStatusDropdownOpen} onClose={() => setIsEdoStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setEdoStatusFilterSet(new Set()); setIsEdoStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {uniqueEdoStatuses.map(s => (
                                <div key={s} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setEdoStatusFilterSet(prev => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; }); }} style={{ background: edoStatusFilterSet.has(s) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{s} {edoStatusFilterSet.has(s) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                        </>
                        )}
                        {docSection === 'ЭДО' && (
                            <DocumentsEdoToolbarFilters
                                edoCounterpartyFilter={edoCatalog.edoCounterpartyFilter}
                                setEdoCounterpartyFilter={edoCatalog.setEdoCounterpartyFilter}
                                edoCounterpartyFilterLabel={edoCatalog.edoCounterpartyFilterLabel}
                                isEdoCounterpartyDropdownOpen={edoCatalog.isEdoCounterpartyDropdownOpen}
                                setIsEdoCounterpartyDropdownOpen={edoCatalog.setIsEdoCounterpartyDropdownOpen}
                                onCloseOtherDropdowns={closeDocumentsToolbarDropdownsExceptSendings}
                            />
                        )}
                        {isDocumentsTransportFilterVisible                        {isDocumentsTransportFilterVisible(docSection, effectiveServiceMode) && (
                            <DocumentsTransportFilter
                                transportFilter={transportFilter}
                                setTransportFilter={setTransportFilter}
                                transportOptions={transportOptionsCurrentSection}
                                isOpen={isTransportDropdownOpen}
                                setIsOpen={setIsTransportDropdownOpen}
                                searchQuery={transportSearchQuery}
                                setSearchQuery={setTransportSearchQuery}
                                closeOtherDropdowns={closeDocumentsToolbarDropdownsForTransport}
                            />
                        )}
                        {docSection === 'Счета' && (
                        <>
                        <div ref={billStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsBillStatusDropdownOpen(!isBillStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Статус счёта: {billStatusFilterSet.size === 0 && !invoiceFavoritesOnly ? 'Все' : billStatusFilterSet.size === 1 && !invoiceFavoritesOnly ? BILL_STATUS_MAP[[...billStatusFilterSet][0]] : invoiceFavoritesOnly && billStatusFilterSet.size === 0 ? 'Избранные' : `Выбрано: ${billStatusFilterSet.size + (invoiceFavoritesOnly ? 1 : 0)}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={billStatusButtonRef} isOpen={isBillStatusDropdownOpen} onClose={() => setIsBillStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setBillStatusFilterSet(new Set()); setInvoiceFavoritesOnly(false); setIsBillStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {(['paid', 'unpaid', 'partial', 'cancelled', 'unknown'] as const).map(key => (
                                <div key={key} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setBillStatusFilterSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} style={{ background: billStatusFilterSet.has(key) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{BILL_STATUS_MAP[key]} {billStatusFilterSet.has(key) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                            <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setInvoiceFavoritesOnly(v => !v); }} style={{ background: invoiceFavoritesOnly ? 'var(--color-bg-hover)' : undefined }}>
                                <Typography.Body>Избранные {invoiceFavoritesOnly ? '✓' : ''}</Typography.Body>
                            </div>
                        </FilterDropdownPortal>
                        <div ref={deliveryStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDeliveryStatusDropdownOpen(!isDeliveryStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Статус перевозки: {deliveryStatusFilterSet.size === 0 ? 'Все' : deliveryStatusFilterSet.size === 1 ? STATUS_MAP[[...deliveryStatusFilterSet][0]] : `Выбрано: ${deliveryStatusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={deliveryStatusButtonRef} isOpen={isDeliveryStatusDropdownOpen} onClose={() => setIsDeliveryStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setDeliveryStatusFilterSet(new Set()); setIsDeliveryStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {(Object.keys(STATUS_MAP) as StatusFilter[]).filter(k => k !== 'favorites' && k !== 'all').map(key => (
                                <div key={key} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setDeliveryStatusFilterSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} style={{ background: deliveryStatusFilterSet.has(key) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{STATUS_MAP[key]} {deliveryStatusFilterSet.has(key) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                        <div ref={routeCargoButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsRouteCargoDropdownOpen(!isRouteCargoDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Маршрут: {routeFilterSet.size === 0 ? 'Все' : routeFilterSet.size === 2 ? 'Выбрано: 2' : routeKeyToCargoLabel([...routeFilterSet][0])} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={routeCargoButtonRef} isOpen={isRouteCargoDropdownOpen} onClose={() => setIsRouteCargoDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setRouteFilterSet(new Set()); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {(['MSK-KGD', 'KGD-MSK'] as const).map(key => (
                                <div key={key} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setRouteFilterSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} style={{ background: routeFilterSet.has(key) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{routeKeyToCargoLabel(key)} {routeFilterSet.has(key) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                        </>
                        )}
                        <CustomPeriodModal
                            isOpen={isCustomModalOpen}
                            onClose={() => setIsCustomModalOpen(false)}
                            dateFrom={customDateFrom}
                            dateTo={customDateTo}
                            onApply={(f, t) => { setCustomDateFrom(f); setCustomDateTo(t); setDateFilter('период'); }}
                        />
                    </div>
                </div>
                )}
                {(docSection === 'Счета' || docSection === 'УПД') && (
                    <div className="documents-sticky-summary-wrap">
                        {docSection === 'Счета' && !loading && !error && invoicesCatalog.filteredInvoiceItems.length > 0 && (
                            <motion.div {...(docsMotionEnabled ? cargoSummaryMotion : { initial: false })}>
                                <DocumentsSummaryCard
                                    summary={invoicesCatalog.documentsSummary}
                                    showSums={showSums}
                                    useServiceRequest={effectiveServiceMode}
                                    saasAnalytics={documentsServiceSaasUi}
                                    expandedMetrics={tableModeFlatDirect}
                                />
                            </motion.div>
                        )}
                        {docSection === 'УПД' && !actsLoading && !actsError && actsCatalog.filteredActs.length > 0 && (
                            <motion.div {...(docsMotionEnabled ? cargoSummaryMotion : { initial: false })}>
                                <DocumentsSummaryCard
                                    summary={actsCatalog.actsSummary}
                                    showSums={showSums}
                                    useServiceRequest={effectiveServiceMode}
                                    saasAnalytics={documentsServiceSaasUi}
                                    expandedMetrics={tableModeFlatDirect}
                                />
                            </motion.div>
                        )}
                    </div>
                )}
                {docSection === 'Заявки' && (
                    <div className="documents-new-order-bar documents-new-order-bar--in-sticky">
                        <Button
                            className="button-primary doc-section-action-btn"
                            onClick={() => setDocumentsOrderFormOpenPersist(true)}
                            disabled={!auth?.login || !auth?.password || !effectiveActiveInn}
                            title={!effectiveActiveInn ? 'Выберите заказчика в хедере' : !auth?.login || !auth?.password ? 'Требуется авторизация' : undefined}
                        >
                            Новая заявка
                        </Button>
                    </div>
                )}
                {docSection === 'Претензии' && (
                    <ClaimsCreateActionButton auth={auth} onOpen={() => claimsCatalog.openClaimsCreateModal()} />
                )}
                {docSection === 'Акты сверок' && (
                    <SverkiOrderActionButton
                        disabled={!effectiveActiveInn || !auth?.login || !auth?.password}
                        onOpen={sverkiCatalog.openSverkiOrderModal}
                    />
                )}
                </div>
            </div>
            <DocumentsInvoicesSection
                active={docSection === 'Счета'}
                auth={auth}
                loading={loading}
                error={error}
                perevozkiLoading={perevozkiLoading}
                effectiveServiceMode={effectiveServiceMode}
                tableModeGroupedByCustomer={tableModeGroupedByCustomer}
                tableModeFlatDirect={tableModeFlatDirect}
                tableModeEffective={tableModeEffective}
                docsMotionEnabled={docsMotionEnabled}
                showCustomerColumn={showCustomerColumn}
                showSums={showSums}
                groupedCustomerTableColSpan={groupedCustomerTableColSpan}
                filteredItems={invoicesCatalog.filteredInvoiceItems}
                documentsSummary={invoicesCatalog.documentsSummary}
                sortedGroupedByCustomer={invoicesCatalog.sortedGroupedByCustomer}
                expandedTableCustomer={invoicesCatalog.expandedTableCustomer}
                setExpandedTableCustomer={invoicesCatalog.setExpandedTableCustomer}
                tableSortColumn={tableSortColumn}
                tableSortOrder={tableSortOrder}
                handleTableSort={handleTableSort}
                innerTableSortColumn={innerTableSortColumn}
                innerTableSortOrder={innerTableSortOrder}
                handleInnerTableSort={handleInnerTableSort}
                sortInvoices={invoicesCatalog.sortInvoices}
                cargoStateByNumber={cargoStateByNumber}
                cargoRouteByNumber={cargoRouteByNumber}
                cargoSumPaidByNumber={cargoSumPaidByNumber}
                normCargoKey={normCargoKey}
                isInvoiceFavorite={invoicesCatalog.isInvoiceFavorite}
                toggleInvoiceFavorite={invoicesCatalog.toggleInvoiceFavorite}
                selectedInvoice={invoicesCatalog.selectedInvoice}
                setSelectedInvoice={invoicesCatalog.setSelectedInvoice}
                onOpenCargo={onOpenCargo}
            />
            {docSection === 'ЭДО' && (<DocumentsEdoSection
                active={docSection === 'ЭДО'}
                auth={auth}
                loading={loading}
                error={error}
                perevozkiLoading={perevozkiLoading}
                documentsServiceSaasUi={documentsServiceSaasUi}
                tableModeFlatDirect={tableModeFlatDirect}
                tableModeEffective={tableModeEffective}
                docsMotionEnabled={docsMotionEnabled}
                showCustomerColumn={showCustomerColumn}
                filteredEdoItems={edoCatalog.filteredEdoItems}
                edoCargoCardItems={edoCatalog.edoCargoCardItems}
                mergedInvoicesEdoTotals={edoCatalog.mergedInvoicesEdoTotals}
                documentsSummary={edoDocumentsSummary}
                sortedGroupedByCustomer={edoCatalog.sortedGroupedByCustomer}
                expandedTableCustomer={edoCatalog.expandedTableCustomer}
                setExpandedTableCustomer={edoCatalog.setExpandedTableCustomer}
                tableSortColumn={tableSortColumn}
                tableSortOrder={tableSortOrder}
                handleTableSort={handleTableSort}
                edoPartnerInns={edoCatalog.edoPartnerInns}
                selectedInvoice={invoicesCatalog.selectedInvoice}
                setSelectedInvoice={invoicesCatalog.setSelectedInvoice}
                isInvoiceFavorite={invoicesCatalog.isInvoiceFavorite}
                toggleInvoiceFavorite={invoicesCatalog.toggleInvoiceFavorite}
                cargoStateByNumber={cargoStateByNumber}
                cargoRouteByNumber={cargoRouteByNumber}
                cargoSumPaidByNumber={cargoSumPaidByNumber}
                onOpenCargo={onOpenCargo}
            />
            {docSection === 'УПД' && (<DocumentsActsSection
                active={docSection === 'УПД'}
                auth={auth}
                actsLoading={actsLoading}
                actsError={actsError}
                perevozkiLoading={perevozkiLoading}
                effectiveServiceMode={effectiveServiceMode}
                tableModeGroupedByCustomer={tableModeGroupedByCustomer}
                tableModeFlatDirect={tableModeFlatDirect}
                tableModeEffective={tableModeEffective}
                docsMotionEnabled={docsMotionEnabled}
                showCustomerColumn={showCustomerColumn}
                showSums={showSums}
                groupedCustomerTableColSpan={groupedCustomerTableColSpan}
                filteredActs={actsCatalog.filteredActs}
                actsSummary={actsCatalog.actsSummary}
                sortedGroupedActsByCustomer={actsCatalog.sortedGroupedActsByCustomer}
                expandedTableActCustomer={actsCatalog.expandedTableActCustomer}
                setExpandedTableActCustomer={actsCatalog.setExpandedTableActCustomer}
                tableSortColumn={tableSortColumn}
                tableSortOrder={tableSortOrder}
                handleTableSort={handleTableSort}
                innerTableActSortColumn={actsCatalog.innerTableActSortColumn}
                innerTableActSortOrder={actsCatalog.innerTableActSortOrder}
                handleInnerTableActSort={actsCatalog.handleInnerTableActSort}
                sortActs={actsCatalog.sortActs}
                items={items}
                cargoStateByNumber={cargoStateByNumber}
                cargoRouteByNumber={cargoRouteByNumber}
                normCargoKey={normCargoKey}
                isInvoiceFavorite={invoicesCatalog.isInvoiceFavorite}
                toggleInvoiceFavorite={invoicesCatalog.toggleInvoiceFavorite}
                selectedAct={actsCatalog.selectedAct}
                setSelectedAct={actsCatalog.setSelectedAct}
                onOpenInvoice={(inv) => { actsCatalog.setSelectedAct(null); setDocSection('Счета'); invoicesCatalog.setSelectedInvoice(inv); }}
                onNavigateToInvoices={() => setDocSection('Счета')}
                onOpenCargo={onOpenCargo}
            />
            {docSection === 'Заявки' && ({docSection === 'Заявки' && (
            <>
            {documentsOrderFormOpen && effectiveActiveInn ? (
                <DocumentsOrderForm
                    auth={auth}
                    activeInn={effectiveActiveInn}
                    activeCustomerName={runtime.activeCustomerName}
                    onBack={() => setDocumentsOrderFormOpenPersist(false)}
                    onSuccess={() => {
                        setDocumentsOrderFormOpenPersist(false);
                        void mutateOrders(undefined, { revalidate: true });
                    }}
                />
            ) : (
            <>
            <DocumentsOrdersSection
                active={docSection === 'Заявки' && !documentsOrderFormOpen}
                ordersLoading={ordersLoading}
                ordersError={ordersError}
                tableModeEffective={tableModeEffective}
                docsMotionEnabled={docsMotionEnabled}
                effectiveServiceMode={effectiveServiceMode}
                effectiveSearchText={effectiveSearchText}
                orderRowsSorted={ordersCatalog.orderRowsSorted}
                ordersSortColumn={ordersCatalog.ordersSortColumn}
                ordersSortOrder={ordersCatalog.ordersSortOrder}
                ordersParcelsSortColumn={ordersCatalog.ordersParcelsSortColumn}
                ordersParcelsSortOrder={ordersCatalog.ordersParcelsSortOrder}
                handleOrdersSort={ordersCatalog.handleOrdersSort}
                handleOrdersParcelsSort={ordersCatalog.handleOrdersParcelsSort}
                expandedOrderRow={ordersCatalog.expandedOrderRow}
                setExpandedOrderRow={ordersCatalog.setExpandedOrderRow}
                onOpenCargo={onOpenCargo}
            />
            {docSection === 'Отправки' && ({docSection === 'Отправки' && (
            <>
            {(sendingsInitialLoading || !!sendingsError) && <DocumentsStateBlocks loading={sendingsInitialLoading} error={sendingsError} emptyText="" />}
            {!sendingsLoading && !sendingsError && sendingRowsSorted.length > 0 && (
                <>
                <SendingsInfographic
                    data={sendingsInfographic}
                    deliveryStatusFilterSet={deliveryStatusFilterSet}
                    setDeliveryStatusFilterSet={setDeliveryStatusFilterSet}
                />
                <SendingsPreface
                    hasAnalytics={hasAnalytics}
                    showSums={showSums}
                    tableModeEffective={tableModeEffective}
                    canEditEor={canEditEor}
                    canEditPlanDate={canEditPlanDate}
                    canRunSanctionsCheck={canRunSanctionsCheck}
                    selectedVisibleSendingCount={selectedVisibleSendingCount}
                    bulkSendingActionLoading={bulkSendingActionLoading}
                    bulkEorMenuOpen={bulkEorMenuOpen}
                    setBulkEorMenuOpen={setBulkEorMenuOpen}
                    bulkPlanDateOpen={bulkPlanDateOpen}
                    setBulkPlanDateOpen={setBulkPlanDateOpen}
                    bulkPlanDateValue={bulkPlanDateValue}
                    setBulkPlanDateValue={setBulkPlanDateValue}
                    bulkSendingActionError={bulkSendingActionError}
                    bulkSendingActionInfo={bulkSendingActionInfo}
                    onApplyEorStatus={applyBulkEorStatus}
                    onApplyPlanDate={applyBulkPlanDate}
                    onApplySanctionsCheck={applyBulkSanctionsCheck}
                    sendingsFerryActionError={sendingsFerryActionError}
                    sendingsRepeatedVehicleTotals={sendingsRepeatedVehicleTotals}
                    sendingsVehicleGrandTotals={sendingsVehicleGrandTotals}
                    sendingsTableTotals={sendingsTableTotals}
                    sendingsSummaryCollapsed={sendingsSummaryCollapsed}
                    setSendingsSummaryCollapsed={setSendingsSummaryCollapsed}
                    rowsCount={sendingRowsSorted.length}
                />
                <SendingsSection {...sendingsSectionProps} />
                </>
            )}
            {!sendingsLoading && !sendingsError && sendingRowsSorted.length === 0 && (
                <Typography.Body className="text-empty-state" style={{ padding: '2rem 0' }}>Нет отправок за выбранный период</Typography.Body>
            )}
            </>
            )}
            <DocumentsTariffsSection
                active={docSection === 'Тарифы'}
                effectiveServiceMode={effectiveServiceMode}
                tableModeEffective={tableModeEffective}
                docsMotionEnabled={docsMotionEnabled}
                cargoModeSwitchMotion={cargoModeSwitchMotion}
                tariffsLoading={tariffsCatalog.tariffsLoading}
                filteredTariffs={tariffsCatalog.filteredTariffs}
                tariffsSortColumn={tariffsCatalog.tariffsSortColumn}
                tariffsSortOrder={tariffsCatalog.tariffsSortOrder}
                setTariffsSortColumn={tariffsCatalog.setTariffsSortColumn}
                setTariffsSortOrder={tariffsCatalog.setTariffsSortOrder}
                isDocFavorite={isDocFavorite}
                toggleDocFavorite={toggleDocFavorite}
            />
            <DocumentsSverkiSection
                active={docSection === 'Акты сверок'}
                effectiveServiceMode={effectiveServiceMode}
                tableModeEffective={tableModeEffective}
                docsMotionEnabled={docsMotionEnabled}
                cargoModeSwitchMotion={cargoModeSwitchMotion}
                sverkiRequestsLoading={sverkiCatalog.sverkiRequestsLoading}
                sverkiRequests={sverkiCatalog.sverkiRequests}
                sverkiLoading={sverkiCatalog.sverkiLoading}
                filteredSverki={sverkiCatalog.filteredSverki}
                sverkiDownloadingId={sverkiCatalog.sverkiDownloadingId}
                sverkiDownloadError={sverkiCatalog.sverkiDownloadError}
                downloadSverkaFile={sverkiCatalog.downloadSverkaFile}
                isDocFavorite={isDocFavorite}
                toggleDocFavorite={toggleDocFavorite}
                sverkiOrderModalOpen={sverkiCatalog.sverkiOrderModalOpen}
                setSverkiOrderModalOpen={sverkiCatalog.setSverkiOrderModalOpen}
                sverkiOrderContract={sverkiCatalog.sverkiOrderContract}
                setSverkiOrderContract={sverkiCatalog.setSverkiOrderContract}
                sverkiOrderContractOptions={sverkiCatalog.sverkiOrderContractOptions}
                sverkiOrderContractsLoading={sverkiCatalog.sverkiOrderContractsLoading}
                sverkiOrderPeriodFrom={sverkiCatalog.sverkiOrderPeriodFrom}
                setSverkiOrderPeriodFrom={sverkiCatalog.setSverkiOrderPeriodFrom}
                sverkiOrderPeriodTo={sverkiCatalog.sverkiOrderPeriodTo}
                setSverkiOrderPeriodTo={sverkiCatalog.setSverkiOrderPeriodTo}
                sverkiOrderSubmitting={sverkiCatalog.sverkiOrderSubmitting}
                sverkiOrderError={sverkiCatalog.sverkiOrderError}
                submitSverkiOrder={sverkiCatalog.submitSverkiOrder}
            />
            <DocumentsDogovorsSection
                active={docSection === 'Договоры'}
                effectiveServiceMode={effectiveServiceMode}
                tableModeEffective={tableModeEffective}
                docsMotionEnabled={docsMotionEnabled}
                cargoModeSwitchMotion={cargoModeSwitchMotion}
                dogovorsLoading={dogovorsCatalog.dogovorsLoading}
                filteredDogovors={dogovorsCatalog.filteredDogovors}
                dogovorsDownloadingId={dogovorsCatalog.dogovorsDownloadingId}
                dogovorsDownloadError={dogovorsCatalog.dogovorsDownloadError}
                downloadDogovorFile={dogovorsCatalog.downloadDogovorFile}
                isDocFavorite={isDocFavorite}
                toggleDocFavorite={toggleDocFavorite}
            />
            <DocumentsClaimsSection
                active={docSection === 'Претензии'}
                auth={auth}
                effectiveActiveInn={effectiveActiveInn}
                effectiveServiceMode={effectiveServiceMode}
                tableModeEffective={tableModeEffective}
                docsMotionEnabled={docsMotionEnabled}
                cargoModeSwitchMotion={cargoModeSwitchMotion}
                claimsLoading={claimsCatalog.claimsLoading}
                filteredClaims={claimsCatalog.filteredClaims}
                claimsActionLoadingId={claimsCatalog.claimsActionLoadingId}
                claimsModalBusy={claimsCatalog.claimsModalBusy}
                claimsReplySubmitting={claimsCatalog.claimsReplySubmitting}
                onOpenCargo={onOpenCargo}
                openClaimDetailModal={claimsCatalog.openClaimDetailModal}
                openDraftEditor={claimsCatalog.openDraftEditor}
                runClaimAction={claimsCatalog.runClaimAction}
                openClaimReplyModal={claimsCatalog.openClaimReplyModal}
                isDocFavorite={isDocFavorite}
                toggleDocFavorite={toggleDocFavorite}
                claimsCreateOpen={claimsCatalog.claimsCreateOpen}
                setClaimsCreateOpen={claimsCatalog.setClaimsCreateOpen}
                claimsEditingId={claimsCatalog.claimsEditingId}
                setClaimsEditingId={claimsCatalog.setClaimsEditingId}
                claimsCreatePrefill={claimsCatalog.claimsCreatePrefill}
                setClaimsModalBusy={claimsCatalog.setClaimsModalBusy}
                reloadClaims={claimsCatalog.reloadClaims}
                claimCargoOptions={claimsCatalog.claimCargoOptions}
                perevozkiItems={perevozkiItems}
                normCargoKey={normCargoKey}
                claimsDetailOpen={claimsCatalog.claimsDetailOpen}
                setClaimsDetailOpen={claimsCatalog.setClaimsDetailOpen}
                claimsDetailLoading={claimsCatalog.claimsDetailLoading}
                claimsDetailError={claimsCatalog.claimsDetailError}
                claimsDetailData={claimsCatalog.claimsDetailData}
                claimDetailStatusKey={claimsCatalog.claimDetailStatusKey}
                claimDetailStatusStyle={claimsCatalog.claimDetailStatusStyle}
                claimCustomerPayload={claimsCatalog.claimCustomerPayload}
                claimsReplyOpen={claimsCatalog.claimsReplyOpen}
                setClaimsReplyOpen={claimsCatalog.setClaimsReplyOpen}
                claimsReplyPhotoFiles={claimsCatalog.claimsReplyPhotoFiles}
                setClaimsReplyPhotoFiles={claimsCatalog.setClaimsReplyPhotoFiles}
                claimsReplyDocumentFiles={claimsCatalog.claimsReplyDocumentFiles}
                setClaimsReplyDocumentFiles={claimsCatalog.setClaimsReplyDocumentFiles}
                claimsReplyVideoLink={claimsCatalog.claimsReplyVideoLink}
                setClaimsReplyVideoLink={claimsCatalog.setClaimsReplyVideoLink}
                claimsReplyError={claimsCatalog.claimsReplyError}
                submitClaimReplyDocuments={claimsCatalog.submitClaimReplyDocuments}
            />
            {docSection !== 'Счета' && docSection !== 'ЭДО' && docSection !== 'УПД' && docSection !== 'Заявки' && docSection !== 'Отправки' && docSection !== 'Тарифы' && docSection !== 'Акты сверок' && docSection !== 'Договоры' && docSection !== 'Претензии' && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0', fontSize: '0.9rem' }}>
                    Раздел «{docSection}» в разработке.
                </Typography.Body>
            )}
        </div>
    );
}
