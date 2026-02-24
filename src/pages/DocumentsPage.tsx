import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Calendar, ChevronDown, ArrowUp, ArrowDown, Share2, Heart, Ship, Loader2, Truck } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { CustomPeriodModal } from "../components/modals/CustomPeriodModal";
import { InvoiceDetailModal } from "../components/modals/InvoiceDetailModal";
import { ActDetailModal } from "../components/modals/ActDetailModal";
import { DateText } from "../components/ui/DateText";
import { formatCurrency, stripOoo, formatInvoiceNumber, normalizeInvoiceStatus, cityToCode } from "../lib/formatUtils";
import { normalizeStatus, STATUS_MAP } from "../lib/statusUtils";
import { StatusBadge } from "../components/shared/StatusBadges";
import {
    loadDateFilterState,
    saveDateFilterState,
    getWeekRange,
    getYearsList,
    getWeeksList,
    MONTH_NAMES,
    DEFAULT_DATE_FROM,
    DEFAULT_DATE_TO,
    getPayTillDate,
getPayTillDateColor,
} from "../lib/dateUtils";
import type { AccountPermissions, AuthData, DateFilter, StatusFilter } from "../types";
import { useDocumentsDateRange } from "./useDocumentsDateRange";
import { useDocumentsDataLoad } from "./useDocumentsDataLoad";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import {
    INVOICE_FAVORITES_VALUE,
    buildActsSummary,
    buildCargoRouteByNumber,
    buildCargoStateByNumber,
    buildCargoTransportByNumber,
    buildDocsSummary,
    buildFilteredActs,
    buildFilteredInvoices,
    buildFilteredOrders,
    getEdoStatus,
    getFirstCargoNumberFromInvoice,
} from "./documentsPipeline";
import { DocumentsSummaryCard, DocumentsStateBlocks } from "./documentsViewBlocks";

const INVOICE_STATUS_OPTIONS = ['Оплачен', 'Не оплачен', 'Оплачен частично'] as const;

type DocSectionKey = 'Счета' | 'УПД' | 'Заявки' | 'Отправки' | 'Претензии' | 'Договоры' | 'Акты сверок' | 'Тарифы';
const DOC_SECTIONS: { key: DocSectionKey; label: string }[] = [
    { key: 'Счета', label: 'Счета' },
    { key: 'УПД', label: 'УПД' },
    { key: 'Заявки', label: 'Заявки' },
    { key: 'Отправки', label: 'Отправки' },
    { key: 'Претензии', label: 'Претензии' },
    { key: 'Договоры', label: 'Договоры' },
    { key: 'Акты сверок', label: 'Акты сверок' },
    { key: 'Тарифы', label: 'Тарифы' },
];

const DOC_SECTION_TO_PERMISSION: Record<DocSectionKey, keyof AccountPermissions> = {
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
    useServiceRequest?: boolean;
    activeInn?: string;
    searchText?: string;
    onOpenCargo?: (cargoNumber: string) => void;
    onOpenChat?: (context?: string) => void | Promise<void>;
    /** Права доступа (для зарегистрированных пользователей) */
    permissions?: AccountPermissions | null;
    /** Показывать суммы (финансовые показатели) */
    showSums?: boolean;
};

export function DocumentsPage({ auth, useServiceRequest, activeInn, searchText, onOpenCargo, onOpenChat, permissions, showSums = true }: DocumentsPageProps) {
    const runtime = useAppRuntime();
    const effectiveServiceMode = useServiceRequest ?? runtime.useServiceRequest;
    const effectiveActiveInn = activeInn ?? runtime.activeInn;
    const effectiveSearchText = searchText ?? runtime.searchText;
    const initDate = () => loadDateFilterState();
    const [dateFilter, setDateFilter] = useState<DateFilter>(() => initDate()?.dateFilter ?? "месяц");
    const [customDateFrom, setCustomDateFrom] = useState(() => initDate()?.customDateFrom ?? DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(() => initDate()?.customDateTo ?? DEFAULT_DATE_TO);
    const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(() => initDate()?.selectedMonthForFilter ?? null);
    const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(() => initDate()?.selectedYearForFilter ?? null);
    const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(() => initDate()?.selectedWeekForFilter ?? null);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months' | 'years' | 'weeks'>('main');
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [customerFilter, setCustomerFilter] = useState<string>('');
    const [orderReceiverFilter, setOrderReceiverFilter] = useState<string>('');
    const [orderSenderFilter, setOrderSenderFilter] = useState<string>('');
    const [orderRouteFilter, setOrderRouteFilter] = useState<string>('all');
    const [actCustomerFilter, setActCustomerFilter] = useState<string>('');
    const [edoStatusFilterSet, setEdoStatusFilterSet] = useState<Set<string>>(() => new Set());
    const [statusFilterSet, setStatusFilterSet] = useState<Set<string>>(() => new Set());
    const [typeFilter, setTypeFilter] = useState<'all' | 'ferry' | 'auto'>('all');
    const [routeFilter, setRouteFilter] = useState<'all' | 'MSK-KGD' | 'KGD-MSK'>('all');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
    const [isOrderSenderDropdownOpen, setIsOrderSenderDropdownOpen] = useState(false);
    const [isOrderRouteDropdownOpen, setIsOrderRouteDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
    const [selectedAct, setSelectedAct] = useState<any | null>(null);
    const [sortBy, setSortBy] = useState<'date' | null>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [ordersSortColumn, setOrdersSortColumn] = useState<'date' | 'number' | 'clientNumber' | 'pickupDate' | 'cargo' | 'sender' | 'receiver' | 'route' | 'customer' | 'comment'>('date');
    const [ordersSortOrder, setOrdersSortOrder] = useState<'asc' | 'desc'>('desc');
    const [ordersParcelsSortColumn, setOrdersParcelsSortColumn] = useState<'parcel' | 'cargo' | 'tmc' | 'consolidation' | 'count' | 'cost'>('parcel');
    const [ordersParcelsSortOrder, setOrdersParcelsSortOrder] = useState<'asc' | 'desc'>('asc');
    const DOCS_TABLE_MODE_KEY = 'haulz.docs.tableMode';
    const DOCS_SECTION_KEY = 'haulz.docs.section';
    const [tableModeByCustomer, setTableModeByCustomer] = useState<boolean>(() => {
        try {
            const v = localStorage.getItem(DOCS_TABLE_MODE_KEY);
            return v === 'true';
        } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem(DOCS_TABLE_MODE_KEY, String(tableModeByCustomer)); } catch { /* ignore */ }
    }, [tableModeByCustomer]);
    const [expandedTableCustomer, setExpandedTableCustomer] = useState<string | null>(null);
    const [expandedTableActCustomer, setExpandedTableActCustomer] = useState<string | null>(null);
    const [expandedOrderRow, setExpandedOrderRow] = useState<string | null>(null);
    const [expandedSendingRow, setExpandedSendingRow] = useState<string | null>(null);
    const allowedDocSections = useMemo(() => {
        if (!permissions) return DOC_SECTIONS;
        return DOC_SECTIONS.filter(({ key }) => permissions[DOC_SECTION_TO_PERMISSION[key]] !== false);
    }, [permissions]);
    const defaultDocSection = allowedDocSections[0]?.key ?? 'Счета';
    const [docSection, setDocSection] = useState<DocSectionKey>(() => {
        try {
            const v = localStorage.getItem(DOCS_SECTION_KEY) as DocSectionKey | null;
            if (v && DOC_SECTIONS.some(({ key }) => key === v)) return v;
        } catch { /* ignore */ }
        return defaultDocSection;
    });
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
        setExpandedOrderRow(null);
        setExpandedSendingRow(null);
    }, [docSection, dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);
    const [tableSortColumn, setTableSortColumn] = useState<'customer' | 'sum' | 'count'>('customer');
    const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
    const [innerTableSortColumn, setInnerTableSortColumn] = useState<'number' | 'date' | 'status' | 'sum' | 'deliveryStatus' | 'route'>('date');
    const [innerTableSortOrder, setInnerTableSortOrder] = useState<'asc' | 'desc'>('desc');
    const [innerTableActSortColumn, setInnerTableActSortColumn] = useState<'number' | 'date' | 'invoice' | 'sum'>('date');
    const [innerTableActSortOrder, setInnerTableActSortOrder] = useState<'asc' | 'desc'>('desc');
    const [sendingsSortColumn, setSendingsSortColumn] = useState<'date' | 'number' | 'route' | 'type' | 'vehicle' | 'comment'>('date');
    const [sendingsSortOrder, setSendingsSortOrder] = useState<'asc' | 'desc'>('desc');
    const [sendingsDetailsView, setSendingsDetailsView] = useState<'general' | 'byCargo' | 'byCustomer'>('general');
    const [sendingsSummarySortColumn, setSendingsSummarySortColumn] = useState<'index' | 'cargo' | 'count' | 'volume' | 'weight' | 'paidWeight' | 'customer'>('index');
    const [sendingsSummarySortOrder, setSendingsSummarySortOrder] = useState<'asc' | 'desc'>('asc');
    const [deliveryStatusFilterSet, setDeliveryStatusFilterSet] = useState<Set<StatusFilter>>(() => new Set());
    const [routeFilterCargo, setRouteFilterCargo] = useState<string>('all');
    const [transportFilter, setTransportFilter] = useState<string>('');
    const [transportSearchQuery, setTransportSearchQuery] = useState<string>('');
    const [isDeliveryStatusDropdownOpen, setIsDeliveryStatusDropdownOpen] = useState(false);
    const [isRouteCargoDropdownOpen, setIsRouteCargoDropdownOpen] = useState(false);
    const [isTransportDropdownOpen, setIsTransportDropdownOpen] = useState(false);
    const [isEdoStatusDropdownOpen, setIsEdoStatusDropdownOpen] = useState(false);
    const [isActCustomerDropdownOpen, setIsActCustomerDropdownOpen] = useState(false);
    const [favVersion, setFavVersion] = useState(0);
    const deliveryStatusButtonRef = useRef<HTMLDivElement | null>(null);
    const routeCargoButtonRef = useRef<HTMLDivElement | null>(null);
    const transportButtonRef = useRef<HTMLDivElement | null>(null);
    const edoStatusButtonRef = useRef<HTMLDivElement | null>(null);
    const actCustomerButtonRef = useRef<HTMLDivElement | null>(null);
    const dateButtonRef = useRef<HTMLDivElement | null>(null);
    const customerButtonRef = useRef<HTMLDivElement | null>(null);
    const receiverButtonRef = useRef<HTMLDivElement | null>(null);
    const orderSenderButtonRef = useRef<HTMLDivElement | null>(null);
    const orderRouteButtonRef = useRef<HTMLDivElement | null>(null);
    const statusButtonRef = useRef<HTMLDivElement | null>(null);
    const typeButtonRef = useRef<HTMLDivElement | null>(null);
    const routeButtonRef = useRef<HTMLDivElement | null>(null);
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const yearWasLongPressRef = useRef(false);
    const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const weekWasLongPressRef = useRef(false);

    useEffect(() => {
        saveDateFilterState({ dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter });
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);

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
        sendingsItems,
        sendingsError,
        sendingsLoading,
        perevozkiItems,
        perevozkiLoading,
    } = useDocumentsDataLoad({
        auth,
        activeInn: effectiveActiveInn,
        useServiceRequest: serviceModeForCurrentDocSection,
        apiDateRange,
        perevozkiDateRange,
    });

    // При выходе из служебного режима прячем и сбрасываем "компанийные" фильтры.
    useEffect(() => {
        if (effectiveServiceMode) return;
        setCustomerFilter('');
        setActCustomerFilter('');
        setTransportFilter('');
        setOrderRouteFilter('all');
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

    const cargoStateByNumber = useMemo(
        () => buildCargoStateByNumber(perevozkiItems || []),
        [perevozkiItems]
    );

    const cargoRouteByNumber = useMemo(
        () => buildCargoRouteByNumber(perevozkiItems || []),
        [perevozkiItems]
    );

    const cargoTransportByNumber = useMemo(
        () => buildCargoTransportByNumber(perevozkiItems || []),
        [perevozkiItems]
    );
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
            const rawTail = vehicle[2] ?? '';
            return rawTail.includes('/') ? `${base}/${region}` : `${base}${region}`;
        }
        const looseVehicle = normalizedSpaces.match(/([A-ZА-Я])[\s\-]*([0-9]{3})[\s\-]*([A-ZА-Я]{2})(?:[\s\-]*\/?[\s\-]*([0-9]{2,3}))?$/u);
        if (looseVehicle) {
            const base = `${looseVehicle[1]}${looseVehicle[2]}${looseVehicle[3]}`;
            const region = looseVehicle[4] ?? '';
            if (!region) return base;
            return normalizedSpaces.includes('/') ? `${base}/${region}` : `${base}${region}`;
        }
        return normalizedSpaces
            .replace(/\bнаименование\s*тс\b[:\-]?\s*/giu, '')
            .replace(/\bконтейнер\b[:\-]?\s*/giu, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }, []);
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

    const uniqueCustomers = useMemo(() => [...new Set(items.map(i => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim())).filter(Boolean))].sort(), [items]);
    const uniqueOrderCustomers = useMemo(
        () => [...new Set((ordersItems || []).map((i: any) => String(i?.ЗаказчикНаименование ?? i?.Заказчик ?? i?.Customer ?? i?.customer ?? i?.Контрагент ?? i?.Contractor ?? i?.Organization ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
        [ordersItems]
    );
    const uniqueOrderReceivers = useMemo(
        () => [...new Set((ordersItems || []).map((i: any) => String(i?.ПолучательНаименование ?? i?.Получатель ?? i?.Receiver ?? i?.receiver ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
        [ordersItems]
    );
    const uniqueOrderSenders = useMemo(
        () => [...new Set((ordersItems || []).map((i: any) => String(i?.ОтправительНаименование ?? i?.Отправитель ?? i?.Sender ?? i?.sender ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
        [ordersItems]
    );
    const uniqueOrderRoutes = useMemo(() => {
        const set = new Set<string>();
        (ordersItems || []).forEach((item: any) => {
            const fromRaw = String(item?.ПунктОтправкиНаименование ?? item?.ПунктОтправленияНаименование ?? item?.ПунктОтправки ?? item?.ПунктОтправления ?? item?.CitySender ?? '').trim();
            const toRaw = String(item?.ПунктНазначенияНаименование ?? item?.ПунктПолученияНаименование ?? item?.ПунктНазначения ?? item?.ПунктДоставки ?? item?.CityReceiver ?? '').trim();
            const route = [cityToCode(fromRaw) || fromRaw, cityToCode(toRaw) || toRaw].filter(Boolean).join(' – ');
            if (route) set.add(route);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [ordersItems]);
    const uniqueSendingCustomers = useMemo(() => [...new Set((sendingsItems || []).map((i: any) => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim())).filter(Boolean))].sort(), [sendingsItems]);

    const uniqueActCustomers = useMemo(() => [...new Set((actsItems || []).map((a: any) => ((a.Customer ?? a.customer ?? a.Контрагент ?? a.Contractor ?? a.Organization ?? '').trim())).filter(Boolean))].sort(), [actsItems]);

    const uniqueEdoStatuses = useMemo(() => {
        const set = new Set<string>();
        [...items, ...(actsItems || [])].forEach((i: any) => {
            const s = getEdoStatus(i);
            if (s) set.add(s);
        });
        return [...set].sort();
    }, [items, actsItems]);

    const uniqueTransportVehicles = useMemo(() => {
        const set = new Set<string>();
        cargoTransportByNumber.forEach((v) => {
            const normalized = normalizeTransportDisplay(v);
            if (normalized) set.add(normalized);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [cargoTransportByNumber, normalizeTransportDisplay]);
    const uniqueOrderTransportVehicles = useMemo(() => {
        const set = new Set<string>();
        (ordersItems || []).forEach((item: any) => {
            const v = normalizeTransportDisplay(item?.АвтомобильCMRНаименование ?? item?.AutoReg ?? item?.autoReg ?? item?.AutoType ?? '');
            if (v) set.add(v);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [ordersItems, normalizeTransportDisplay]);
    const uniqueSendingTransportVehicles = useMemo(() => {
        const set = new Set<string>();
        (sendingsItems || []).forEach((item: any) => {
            const v = normalizeTransportDisplay(item?.АвтомобильCMRНаименование ?? item?.AutoReg ?? item?.autoReg ?? item?.AutoType ?? '');
            if (v) set.add(v);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [sendingsItems, normalizeTransportDisplay]);
    const uniqueSendingRoutes = useMemo(() => {
        const set = new Set<string>();
        (sendingsItems || []).forEach((item: any) => {
            const from = cityToCode(item?.ПунктОтправленияГородАэропорт ?? item?.CitySender ?? item?.ГородОтправления);
            const to = cityToCode(item?.ПунктНазначенияГородАэропорт ?? item?.CityReceiver ?? item?.ГородНазначения);
            const route = [from, to].filter(Boolean).join(' – ');
            if (route) set.add(route);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }, [sendingsItems]);

    const toggleInvoiceFavorite = useCallback((invNum: string | undefined) => {
        if (!invNum) return;
        try {
            const raw = typeof localStorage !== 'undefined' && localStorage.getItem('haulz.invoiceFavorites');
            const arr: string[] = raw ? JSON.parse(raw) : [];
            const set = new Set(arr);
            if (set.has(invNum)) set.delete(invNum);
            else set.add(invNum);
            localStorage.setItem('haulz.invoiceFavorites', JSON.stringify([...set]));
            setFavVersion(v => v + 1);
        } catch {}
    }, []);

    const isInvoiceFavorite = useCallback((invNum: string | undefined): boolean => {
        if (!invNum) return false;
        try {
            const raw = typeof localStorage !== 'undefined' && localStorage.getItem('haulz.invoiceFavorites');
            const arr: string[] = raw ? JSON.parse(raw) : [];
            return arr.includes(invNum);
        } catch { return false; }
    }, []);

    const filteredItems = useMemo(() => {
        return buildFilteredInvoices({
            items,
            activeInn: effectiveActiveInn,
            useServiceRequest: effectiveServiceMode,
            customerFilter,
            statusFilterSet,
            typeFilter,
            routeFilter,
            deliveryStatusFilterSet,
            routeFilterCargo,
            transportFilter,
            searchText: effectiveSearchText,
            edoStatusFilterSet,
            sortBy,
            sortOrder,
            isInvoiceFavorite,
            getFirstCargoNumberFromInvoice,
            cargoStateByNumber,
            cargoRouteByNumber,
            cargoTransportByNumber,
        });
    }, [items, effectiveActiveInn, effectiveServiceMode, customerFilter, statusFilterSet, typeFilter, routeFilter, sortBy, sortOrder, favVersion, isInvoiceFavorite, deliveryStatusFilterSet, routeFilterCargo, transportFilter, effectiveSearchText, edoStatusFilterSet, getFirstCargoNumberFromInvoice, cargoStateByNumber, cargoRouteByNumber, cargoTransportByNumber, normCargoKey]);

    const documentsSummary = useMemo(() => buildDocsSummary(filteredItems), [filteredItems]);

    const sortedActs = useMemo(() => {
        const list = [...(actsItems || [])];
        const getDate = (a: any) => (a.DateDoc ?? a.Date ?? a.date ?? '').toString();
        list.sort((a, b) => {
            const cmp = getDate(a).localeCompare(getDate(b));
            return sortOrder === 'desc' ? -cmp : cmp;
        });
        return list;
    }, [actsItems, sortOrder]);

    const filteredActs = useMemo(() => {
        return buildFilteredActs({
            sortedActs,
            activeInn: effectiveActiveInn,
            useServiceRequest: effectiveServiceMode,
            actCustomerFilter,
            searchText: effectiveSearchText,
            edoStatusFilterSet,
            transportFilter,
            getFirstCargoNumberFromInvoice,
            cargoTransportByNumber,
        });
    }, [sortedActs, effectiveActiveInn, effectiveServiceMode, actCustomerFilter, effectiveSearchText, edoStatusFilterSet, transportFilter, getFirstCargoNumberFromInvoice, cargoTransportByNumber, normCargoKey]);

    const actsSummary = useMemo(() => buildActsSummary(filteredActs), [filteredActs]);
    const filteredOrders = useMemo(() => {
        const base = buildFilteredOrders({
            items: ordersItems || [],
            activeInn: effectiveActiveInn,
            useServiceRequest: effectiveServiceMode,
            customerFilter,
            typeFilter,
            routeFilter,
            deliveryStatusFilterSet,
            routeFilterCargo,
            transportFilter: '',
            searchText: effectiveSearchText,
            sortBy,
            sortOrder,
        });
        return base.filter((i: any) => {
            if (orderReceiverFilter && String(i?.ПолучательНаименование ?? i?.Получатель ?? i?.Receiver ?? i?.receiver ?? '').trim() !== orderReceiverFilter) return false;
            if (orderSenderFilter && String(i?.ОтправительНаименование ?? i?.Отправитель ?? i?.Sender ?? i?.sender ?? '').trim() !== orderSenderFilter) return false;
            if (orderRouteFilter !== 'all') {
                const fromRaw = String(i?.ПунктОтправкиНаименование ?? i?.ПунктОтправленияНаименование ?? i?.ПунктОтправки ?? i?.ПунктОтправления ?? i?.CitySender ?? '').trim();
                const toRaw = String(i?.ПунктНазначенияНаименование ?? i?.ПунктПолученияНаименование ?? i?.ПунктНазначения ?? i?.ПунктДоставки ?? i?.CityReceiver ?? '').trim();
                const route = [cityToCode(fromRaw) || fromRaw, cityToCode(toRaw) || toRaw].filter(Boolean).join(' – ');
                if (route !== orderRouteFilter) return false;
            }
            return true;
        });
    }, [ordersItems, effectiveActiveInn, effectiveServiceMode, customerFilter, typeFilter, routeFilter, deliveryStatusFilterSet, routeFilterCargo, effectiveSearchText, sortBy, sortOrder, orderReceiverFilter, orderSenderFilter, orderRouteFilter]);
    const ordersSummary = useMemo(() => buildDocsSummary(filteredOrders), [filteredOrders]);
    const filteredSendings = useMemo(() => {
        return buildFilteredOrders({
            items: sendingsItems || [],
            activeInn: effectiveActiveInn,
            useServiceRequest: true,
            customerFilter,
            typeFilter,
            routeFilter,
            deliveryStatusFilterSet,
            routeFilterCargo,
            transportFilter,
            searchText: effectiveSearchText,
            sortBy,
            sortOrder,
        });
    }, [sendingsItems, effectiveActiveInn, customerFilter, typeFilter, routeFilter, deliveryStatusFilterSet, routeFilterCargo, transportFilter, effectiveSearchText, sortBy, sortOrder]);
    const sendingsSummary = useMemo(() => buildDocsSummary(filteredSendings), [filteredSendings]);

    const groupedByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: any[]; sum: number }>();
        filteredItems.forEach(inv => {
            const key = (inv.Customer ?? inv.customer ?? inv.Контрагент ?? inv.Contractor ?? inv.Organization ?? '').trim() || '—';
            const v = inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount ?? 0;
            const sum = typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
            const existing = map.get(key);
            if (existing) {
                existing.items.push(inv);
                existing.sum += sum;
            } else map.set(key, { customer: key, items: [inv], sum });
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredItems]);

    const sortedGroupedByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; items: any[] }) =>
            tableSortColumn === 'customer' ? (stripOoo(row.customer) || '').toLowerCase() : tableSortColumn === 'sum' ? row.sum : row.items.length;
        return [...groupedByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedByCustomer, tableSortColumn, tableSortOrder]);

    const groupedActsByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: any[]; sum: number }>();
        filteredActs.forEach((act: any) => {
            const key = (act.Customer ?? act.customer ?? act.Контрагент ?? act.Contractor ?? act.Organization ?? '').trim() || '—';
            const v = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
            const sum = typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
            const existing = map.get(key);
            if (existing) {
                existing.items.push(act);
                existing.sum += sum;
            } else map.set(key, { customer: key, items: [act], sum });
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredActs]);

    const sortedGroupedActsByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; items: any[] }) =>
            tableSortColumn === 'customer' ? (stripOoo(row.customer) || '').toLowerCase() : tableSortColumn === 'sum' ? row.sum : row.items.length;
        return [...groupedActsByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedActsByCustomer, tableSortColumn, tableSortOrder]);
    const groupedOrdersByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: any[]; sum: number }>();
        filteredOrders.forEach((order: any) => {
            const key = (order.Customer ?? order.customer ?? order.Контрагент ?? order.Contractor ?? order.Organization ?? '').trim() || '—';
            const v = order.Sum ?? order.sum ?? order.Сумма ?? order.Amount ?? 0;
            const sum = typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
            const existing = map.get(key);
            if (existing) {
                existing.items.push(order);
                existing.sum += sum;
            } else map.set(key, { customer: key, items: [order], sum });
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredOrders]);
    const sortedGroupedOrdersByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; items: any[] }) =>
            tableSortColumn === 'customer' ? (stripOoo(row.customer) || '').toLowerCase() : tableSortColumn === 'sum' ? row.sum : row.items.length;
        return [...groupedOrdersByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedOrdersByCustomer, tableSortColumn, tableSortOrder]);
    const groupedSendingsByCustomer = useMemo(() => {
        const map = new Map<string, { customer: string; items: any[]; sum: number }>();
        filteredSendings.forEach((sending: any) => {
            const key = (sending.Customer ?? sending.customer ?? sending.Контрагент ?? sending.Contractor ?? sending.Organization ?? '').trim() || '—';
            const v = sending.Sum ?? sending.sum ?? sending.Сумма ?? sending.Amount ?? 0;
            const sum = typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
            const existing = map.get(key);
            if (existing) {
                existing.items.push(sending);
                existing.sum += sum;
            } else map.set(key, { customer: key, items: [sending], sum });
        });
        return Array.from(map.entries()).map(([, v]) => v);
    }, [filteredSendings]);
    const sortedGroupedSendingsByCustomer = useMemo(() => {
        const key = (row: { customer: string; sum: number; items: any[] }) =>
            tableSortColumn === 'customer' ? (stripOoo(row.customer) || '').toLowerCase() : tableSortColumn === 'sum' ? row.sum : row.items.length;
        return [...groupedSendingsByCustomer].sort((a, b) => {
            const va = key(a);
            const vb = key(b);
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return tableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [groupedSendingsByCustomer, tableSortColumn, tableSortOrder]);

    const handleTableSort = (column: 'customer' | 'sum' | 'count') => {
        if (tableSortColumn === column) setTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setTableSortColumn(column); setTableSortOrder('asc'); }
    };

    const handleInnerTableSort = (column: 'number' | 'date' | 'status' | 'sum' | 'deliveryStatus' | 'route') => {
        if (innerTableSortColumn === column) setInnerTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setInnerTableSortColumn(column); setInnerTableSortOrder(column === 'date' ? 'desc' : 'asc'); }
    };

    const handleInnerTableActSort = (column: 'number' | 'date' | 'invoice' | 'sum') => {
        if (innerTableActSortColumn === column) setInnerTableActSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setInnerTableActSortColumn(column); setInnerTableActSortOrder(column === 'date' ? 'desc' : 'asc'); }
    };

    const sortActs = useCallback((acts: any[]) => {
        const getNum = (a: any) => (a.Number ?? a.number ?? '').toString().replace(/^0000-/, '');
        const getDate = (a: any) => (a.DateDoc ?? a.Date ?? a.date ?? '').toString();
        const getInvoice = (a: any) => (a.Invoice ?? a.invoice ?? a.Счёт ?? '').toString();
        const getSum = (a: any) => Number(a.SumDoc ?? a.Sum ?? a.sum ?? 0) || 0;
        return [...acts].sort((a, b) => {
            let cmp = 0;
            switch (innerTableActSortColumn) {
                case 'number': cmp = (getNum(a) || '').localeCompare(getNum(b) || '', undefined, { numeric: true }); break;
                case 'date': cmp = (getDate(a) || '').localeCompare(getDate(b) || ''); break;
                case 'invoice': cmp = (getInvoice(a) || '').localeCompare(getInvoice(b) || '', undefined, { numeric: true }); break;
                case 'sum': cmp = getSum(a) - getSum(b); break;
            }
            return innerTableActSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [innerTableActSortColumn, innerTableActSortOrder]);

    const sortInvoices = useCallback((items: any[]) => {
        const getNum = (inv: any) => (inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '').toString().replace(/^0000-/, '');
        const getDate = (inv: any) => (inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '').toString();
        const getStatus = (inv: any) => normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
        const getSum = (inv: any) => Number(inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount ?? 0) || 0;
        const getDeliveryState = (inv: any) => {
            const num = getFirstCargoNumberFromInvoice(inv);
            return (num ? cargoStateByNumber.get(normCargoKey(num)) : undefined) ?? '';
        };
        const getRoute = (inv: any) => {
            const num = getFirstCargoNumberFromInvoice(inv);
            return (num ? cargoRouteByNumber.get(normCargoKey(num)) : undefined) ?? '';
        };
        return [...items].sort((a, b) => {
            let cmp = 0;
            switch (innerTableSortColumn) {
                case 'number': cmp = (getNum(a) || '').localeCompare(getNum(b) || '', undefined, { numeric: true }); break;
                case 'date': cmp = (getDate(a) || '').localeCompare(getDate(b) || ''); break;
                case 'status': cmp = (getStatus(a) || '').localeCompare(getStatus(b) || ''); break;
                case 'sum': cmp = getSum(a) - getSum(b); break;
                case 'deliveryStatus': cmp = (getDeliveryState(a) || '').localeCompare(getDeliveryState(b) || ''); break;
                case 'route': cmp = (getRoute(a) || '').localeCompare(getRoute(b) || ''); break;
            }
            return innerTableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [innerTableSortColumn, innerTableSortOrder, getFirstCargoNumberFromInvoice, cargoStateByNumber, cargoRouteByNumber, normCargoKey]);
    const sortOrders = useCallback((items: any[]) => {
        const getNum = (row: any) => (row.Number ?? row.number ?? row.Номер ?? row.N ?? '').toString().replace(/^0000-/, '');
        const getDate = (row: any) => (row.DateZayavki ?? row.DateOtpr ?? row.DateSend ?? row.DatePrih ?? row.DateVr ?? row.DateDoc ?? row.Date ?? row.date ?? '').toString();
        const getStatus = (row: any) => normalizeStatus(row.State ?? row.state ?? row.Статус ?? '');
        const getSum = (row: any) => Number(row.Sum ?? row.sum ?? row.Сумма ?? row.Amount ?? 0) || 0;
        const getRoute = (row: any) => [cityToCode(row.CitySender), cityToCode(row.CityReceiver)].filter(Boolean).join(' – ') || '';
        return [...items].sort((a, b) => {
            let cmp = 0;
            switch (innerTableSortColumn) {
                case 'number': cmp = (getNum(a) || '').localeCompare(getNum(b) || '', undefined, { numeric: true }); break;
                case 'date': cmp = (getDate(a) || '').localeCompare(getDate(b) || ''); break;
                case 'status':
                case 'deliveryStatus': cmp = (getStatus(a) || '').localeCompare(getStatus(b) || ''); break;
                case 'sum': cmp = getSum(a) - getSum(b); break;
                case 'route': cmp = (getRoute(a) || '').localeCompare(getRoute(b) || ''); break;
            }
            return innerTableSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [innerTableSortColumn, innerTableSortOrder]);
    const isRequestJournalSection = docSection === 'Заявки' || docSection === 'Отправки';
    const tableModeEffective = isRequestJournalSection ? true : tableModeByCustomer;
    const orderRowsSorted = useMemo(() => {
        const getDate = (row: any) => String(row?.Дата ?? row?.DateZayavki ?? row?.Date ?? row?.date ?? "");
        const getNumber = (row: any) => String(row?.НомерЗаявки ?? row?.Номер ?? row?.Number ?? row?.number ?? row?.N ?? "");
        const getClientNumber = (row: any) => String(row?.НомерЗаявкиКлиента ?? row?.ClientRequestNumber ?? "");
        const getPickupDate = (row: any) => String(row?.ДатаЗабораПлан ?? row?.PickupDatePlan ?? "");
        const getSender = (row: any) => String(row?.ОтправительНаименование ?? row?.Отправитель ?? row?.Sender ?? row?.sender ?? "");
        const getReceiver = (row: any) => String(row?.ПолучательНаименование ?? row?.Получатель ?? row?.Receiver ?? row?.receiver ?? "");
        const getCustomer = (row: any) => String(row?.ЗаказчикНаименование ?? row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? "");
        const getComment = (row: any) => String(row?.Комментарий ?? row?.Comment ?? "");
        const getCargo = (row: any) => {
            const rawParcels = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
            const firstParcel = Array.isArray(rawParcels)
                ? rawParcels[0]
                : (rawParcels && typeof rawParcels === 'object'
                    ? Object.values(rawParcels as Record<string, any>)[0]
                    : undefined);
            return String(row?.НомерПеревозки ?? row?.Перевозка ?? row?.CargoNumber ?? row?.NumberPerevozki ?? (firstParcel as any)?.Перевозка ?? "");
        };
        const getRoute = (row: any) => {
            const from = String(row?.ПунктОтправкиНаименование ?? row?.ПунктОтправленияНаименование ?? row?.ПунктОтправки ?? row?.ПунктОтправления ?? row?.CitySender ?? '').trim();
            const to = String(row?.ПунктНазначенияНаименование ?? row?.ПунктПолученияНаименование ?? row?.ПунктНазначения ?? row?.ПунктДоставки ?? row?.CityReceiver ?? '').trim();
            return [cityToCode(from) || from, cityToCode(to) || to].filter(Boolean).join(' – ');
        };
        return [...filteredOrders].sort((a, b) => {
            let cmp = 0;
            switch (ordersSortColumn) {
                case 'date': cmp = getDate(a).localeCompare(getDate(b)); break;
                case 'number': cmp = getNumber(a).localeCompare(getNumber(b), undefined, { numeric: true }); break;
                case 'clientNumber': cmp = getClientNumber(a).localeCompare(getClientNumber(b), undefined, { numeric: true }); break;
                case 'pickupDate': cmp = getPickupDate(a).localeCompare(getPickupDate(b)); break;
                case 'cargo': cmp = getCargo(a).localeCompare(getCargo(b), undefined, { numeric: true }); break;
                case 'sender': cmp = getSender(a).localeCompare(getSender(b)); break;
                case 'receiver': cmp = getReceiver(a).localeCompare(getReceiver(b)); break;
                case 'route': cmp = getRoute(a).localeCompare(getRoute(b)); break;
                case 'customer': cmp = getCustomer(a).localeCompare(getCustomer(b)); break;
                case 'comment': cmp = getComment(a).localeCompare(getComment(b)); break;
            }
            return ordersSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [filteredOrders, ordersSortColumn, ordersSortOrder]);
    const sendingRowsSorted = useMemo(() => {
        const getDate = (row: any) => String(row?.Дата ?? row?.Date ?? row?.date ?? "");
        const getNumber = (row: any) => String(row?.Номер ?? row?.Number ?? row?.number ?? "");
        const getRoute = (row: any) => {
            const routeFrom = String(row?.ПунктОтправленияГородАэропорт ?? row?.CitySender ?? row?.ГородОтправления ?? '').trim();
            const routeTo = String(row?.ПунктНазначенияГородАэропорт ?? row?.CityReceiver ?? row?.ГородНазначения ?? '').trim();
            return [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(' – ') || [routeFrom, routeTo].filter(Boolean).join(' – ') || '';
        };
        const getType = (row: any) => {
            const vehicle = normalizeTransportDisplay(row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.AutoType ?? "");
            const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(vehicle.toUpperCase());
            return hasPlate ? 'авто' : 'паром';
        };
        const getVehicle = (row: any) => normalizeTransportDisplay(row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.AutoType ?? "");
        const getComment = (row: any) => String(row?.Комментарий ?? row?.Comment ?? "");
        return [...filteredSendings].sort((a, b) => {
            let cmp = 0;
            switch (sendingsSortColumn) {
                case 'date':
                    cmp = getDate(a).localeCompare(getDate(b));
                    break;
                case 'number':
                    cmp = getNumber(a).localeCompare(getNumber(b), undefined, { numeric: true });
                    break;
                case 'route':
                    cmp = getRoute(a).localeCompare(getRoute(b));
                    break;
                case 'type':
                    cmp = getType(a).localeCompare(getType(b));
                    break;
                case 'vehicle':
                    cmp = getVehicle(a).localeCompare(getVehicle(b));
                    break;
                case 'comment':
                    cmp = getComment(a).localeCompare(getComment(b));
                    break;
            }
            return sendingsSortOrder === 'asc' ? cmp : -cmp;
        });
    }, [filteredSendings, sendingsSortColumn, sendingsSortOrder, normalizeTransportDisplay]);
    const handleSendingsSort = useCallback((column: 'date' | 'number' | 'route' | 'type' | 'vehicle' | 'comment') => {
        if (sendingsSortColumn === column) {
            setSendingsSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSendingsSortColumn(column);
        setSendingsSortOrder(column === 'date' ? 'desc' : 'asc');
    }, [sendingsSortColumn]);
    const handleSendingsSummarySort = useCallback((column: 'index' | 'cargo' | 'count' | 'volume' | 'weight' | 'paidWeight' | 'customer') => {
        if (sendingsSummarySortColumn === column) {
            setSendingsSummarySortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setSendingsSummarySortColumn(column);
        setSendingsSummarySortOrder(column === 'index' ? 'asc' : 'desc');
    }, [sendingsSummarySortColumn]);
    const handleOrdersSort = useCallback((column: 'date' | 'number' | 'clientNumber' | 'pickupDate' | 'cargo' | 'sender' | 'receiver' | 'route' | 'customer' | 'comment') => {
        if (ordersSortColumn === column) {
            setOrdersSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setOrdersSortColumn(column);
        setOrdersSortOrder(column === 'date' || column === 'pickupDate' ? 'desc' : 'asc');
    }, [ordersSortColumn]);
    const handleOrdersParcelsSort = useCallback((column: 'parcel' | 'cargo' | 'tmc' | 'consolidation' | 'count' | 'cost') => {
        if (ordersParcelsSortColumn === column) {
            setOrdersParcelsSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }
        setOrdersParcelsSortColumn(column);
        setOrdersParcelsSortOrder('asc');
    }, [ordersParcelsSortColumn]);
    const getRequestParcels = useCallback((row: any): any[] => {
        const raw = row?.Посылки ?? row?.Parcels ?? row?.parcels ?? row?.Packages ?? row?.packages;
        if (Array.isArray(raw)) return raw;
        if (typeof raw === "string" && raw.trim()) {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    }, []);
    const getParcelSearchText = useCallback((parcel: any): string => {
        const parts: string[] = [];
        const seen = new WeakSet<object>();
        const collect = (value: unknown, depth = 0) => {
            if (value == null || depth > 8) return;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                const s = String(value).trim();
                if (s) parts.push(s);
                return;
            }
            if (Array.isArray(value)) {
                value.forEach((item) => collect(item, depth + 1));
                return;
            }
            if (typeof value === 'object') {
                const obj = value as Record<string, unknown>;
                if (seen.has(obj)) return;
                seen.add(obj);
                Object.values(obj).forEach((v) => collect(v, depth + 1));
            }
        };
        collect(parcel);
        return parts.join(' ').toLowerCase();
    }, []);
    const getSendingTransportType = useCallback((vehicleText: string): 'ferry' | 'auto' | '' => {
        const s = String(vehicleText ?? '').toUpperCase().trim();
        if (!s) return '';
        const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(s);
        return hasPlate ? 'auto' : 'ferry';
    }, []);

    return (
        <div className="w-full">
            <div className="cargo-page-sticky-header">
                <Flex align="center" justify="space-between" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Документы</Typography.Headline>
                    {!isRequestJournalSection && (
                        <Flex align="center" gap="0.5rem" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <Typography.Body style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Таблица</Typography.Body>
                            <span className="roles-switch-wrap" style={{ display: 'inline-flex' }} aria-label={tableModeByCustomer ? 'Показать карточки' : 'Показать таблицу'}>
                                <TapSwitch checked={tableModeByCustomer} onToggle={() => setTableModeByCustomer(v => !v)} />
                            </span>
                        </Flex>
                    )}
                </Flex>
                {/* Кнопки разделов: ниже «Документы», выше фильтров */}
                <div
                    className="doc-sections-row"
                    style={{
                        marginBottom: '0.75rem',
                        overflowX: 'auto',
                        WebkitOverflowScrolling: 'touch',
                        paddingBottom: '4px',
                    }}
                >
                    <Flex align="center" gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                        {allowedDocSections.map(({ key, label }) => {
                            const isActive = docSection === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    className="doc-section-tab"
                                    onClick={() => setDocSection(key)}
                                    style={{
                                        flexShrink: 0,
                                        padding: '0.5rem 1rem',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        borderRadius: 12,
                                        border: isActive ? 'none' : '1px solid var(--color-border, #e5e7eb)',
                                        background: isActive
                                            ? 'var(--color-primary-blue, #2563eb)'
                                            : 'var(--color-panel-secondary, #f3f4f6)',
                                        color: isActive ? '#fff' : 'var(--color-text-secondary, #6b7280)',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s',
                                        boxShadow: isActive ? '0 2px 8px rgba(37, 99, 235, 0.35)' : 'none',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'var(--color-bg-hover, #e5e7eb)';
                                            e.currentTarget.style.borderColor = 'var(--color-border, #d1d5db)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'var(--color-panel-secondary, #f3f4f6)';
                                            e.currentTarget.style.borderColor = 'var(--color-border, #e5e7eb)';
                                        }
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </Flex>
                </div>
                {(docSection === 'Счета' || docSection === 'УПД' || docSection === 'Заявки' || docSection === 'Отправки') && (
                <div className="filters-container filters-row-scroll">
                    <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                        <Button className="filter-button" style={{ padding: '0.5rem', minWidth: 'auto' }} onClick={() => { setSortBy('date'); setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); }} title={sortOrder === 'desc' ? 'Дата по убыванию' : 'Дата по возрастанию'}>
                            {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                        </Button>
                        <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Дата: {dateFilter === 'период' ? 'Период' : dateFilter === 'месяц' && selectedMonthForFilter ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}` : dateFilter === 'год' && selectedYearForFilter ? `${selectedYearForFilter}` : dateFilter === 'неделя' && selectedWeekForFilter ? (() => { const r = getWeekRange(selectedWeekForFilter); return `${r.dateFrom.slice(8, 10)}.${r.dateFrom.slice(5, 7)} – ${r.dateTo.slice(8, 10)}.${r.dateTo.slice(5, 7)}`; })() : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
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
                                    const title = isMonth ? 'Клик — текущий месяц; удерживайте — выбор месяца' : isYear ? 'Клик — 365 дней; удерживайте — выбор года' : isWeek ? 'Клик — предыдущая неделя; удерживайте — выбор недели (пн–вс)' : undefined;
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
                        {(docSection === 'Счета' || docSection === 'Заявки') && effectiveServiceMode && (
                            <>
                                <div ref={customerButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsCustomerDropdownOpen(!isCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsOrderSenderDropdownOpen(false); setIsOrderRouteDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Заказчик: {customerFilter ? stripOoo(customerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={customerButtonRef} isOpen={isCustomerDropdownOpen} onClose={() => setIsCustomerDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setCustomerFilter(''); setIsCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {(docSection === 'Заявки' ? uniqueOrderCustomers : docSection === 'Отправки' ? uniqueSendingCustomers : uniqueCustomers).map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setCustomerFilter(c); setIsCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {docSection === 'Заявки' && (
                            <>
                                <div ref={receiverButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsReceiverDropdownOpen(!isReceiverDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsOrderSenderDropdownOpen(false); setIsOrderRouteDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Получатель: {orderReceiverFilter ? stripOoo(orderReceiverFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={receiverButtonRef} isOpen={isReceiverDropdownOpen} onClose={() => setIsReceiverDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setOrderReceiverFilter(''); setIsReceiverDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueOrderReceivers.map((receiver) => (
                                        <div key={receiver} className="dropdown-item" onClick={() => { setOrderReceiverFilter(receiver); setIsReceiverDropdownOpen(false); }}>
                                            <Typography.Body>{stripOoo(receiver)}</Typography.Body>
                                        </div>
                                    ))}
                                </FilterDropdownPortal>
                                <div ref={orderSenderButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsOrderSenderDropdownOpen(!isOrderSenderDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsOrderRouteDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Отправитель: {orderSenderFilter ? stripOoo(orderSenderFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={orderSenderButtonRef} isOpen={isOrderSenderDropdownOpen} onClose={() => setIsOrderSenderDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setOrderSenderFilter(''); setIsOrderSenderDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueOrderSenders.map((sender) => (
                                        <div key={sender} className="dropdown-item" onClick={() => { setOrderSenderFilter(sender); setIsOrderSenderDropdownOpen(false); }}>
                                            <Typography.Body>{stripOoo(sender)}</Typography.Body>
                                        </div>
                                    ))}
                                </FilterDropdownPortal>
                                <div ref={orderRouteButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsOrderRouteDropdownOpen(!isOrderRouteDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsOrderSenderDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Маршрут: {orderRouteFilter === 'all' ? 'Все' : orderRouteFilter} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={orderRouteButtonRef} isOpen={isOrderRouteDropdownOpen} onClose={() => setIsOrderRouteDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setOrderRouteFilter('all'); setIsOrderRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueOrderRoutes.map((route) => (
                                        <div key={route} className="dropdown-item" onClick={() => { setOrderRouteFilter(route); setIsOrderRouteDropdownOpen(false); }}>
                                            <Typography.Body>{route}</Typography.Body>
                                        </div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {docSection === 'Отправки' && (
                        <>
                        <div ref={routeCargoButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsRouteCargoDropdownOpen(!isRouteCargoDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Маршрут: {routeFilterCargo === 'all' ? 'Все' : routeFilterCargo} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={routeCargoButtonRef} isOpen={isRouteCargoDropdownOpen} onClose={() => setIsRouteCargoDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('all'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {uniqueSendingRoutes.map((route) => (
                                <div key={route} className="dropdown-item" onClick={() => { setRouteFilterCargo(route); setIsRouteCargoDropdownOpen(false); }}>
                                    <Typography.Body>{route}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                        </>
                        )}
                        {docSection === 'УПД' && effectiveServiceMode && (
                            <>
                                <div ref={actCustomerButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsActCustomerDropdownOpen(!isActCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                        Заказчик: {actCustomerFilter ? stripOoo(actCustomerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={actCustomerButtonRef} isOpen={isActCustomerDropdownOpen} onClose={() => setIsActCustomerDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setActCustomerFilter(''); setIsActCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueActCustomers.map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setActCustomerFilter(c); setIsActCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        {(docSection === 'Счета' || docSection === 'УПД') && (
                        <>
                        <div ref={edoStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsEdoStatusDropdownOpen(!isEdoStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
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
                        {((effectiveServiceMode && docSection !== 'Заявки') || docSection === 'Отправки') && (
                        <>
                        <div ref={transportButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsTransportDropdownOpen(!isTransportDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); }}>
                                Транспортное средство: {transportFilter || 'Все'} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={transportButtonRef} isOpen={isTransportDropdownOpen} onClose={() => { setIsTransportDropdownOpen(false); setTransportSearchQuery(''); }}>
                            <div className="dropdown-item" style={{ padding: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="text"
                                    placeholder="Поиск..."
                                    value={transportSearchQuery}
                                    onChange={(e) => setTransportSearchQuery(e.target.value)}
                                    className="filter-search-input"
                                    style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '0.875rem', outline: 'none' }}
                                />
                            </div>
                            <div className="dropdown-item" onClick={() => { setTransportFilter(''); setIsTransportDropdownOpen(false); setTransportSearchQuery(''); }}><Typography.Body>Все</Typography.Body></div>
                            {(docSection === 'Заявки' ? uniqueOrderTransportVehicles : docSection === 'Отправки' ? uniqueSendingTransportVehicles : uniqueTransportVehicles)
                                .filter(v => !transportSearchQuery.trim() || v.toLowerCase().includes(transportSearchQuery.trim().toLowerCase()))
                                .map(v => (
                                    <div key={v} className="dropdown-item" onClick={() => { setTransportFilter(v); setIsTransportDropdownOpen(false); setTransportSearchQuery(''); }}><Typography.Body>{v}</Typography.Body></div>
                                ))}
                        </FilterDropdownPortal>
                        </>
                        )}
                        {docSection === 'Счета' && (
                        <>
                        <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Статус счёта: {statusFilterSet.size === 0 ? 'Все' : statusFilterSet.size === 1 ? (statusFilterSet.has(INVOICE_FAVORITES_VALUE) ? 'Избранные' : [...statusFilterSet][0]) : `Выбрано: ${statusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={statusButtonRef} isOpen={isStatusDropdownOpen} onClose={() => setIsStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setStatusFilterSet(new Set()); setIsStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {INVOICE_STATUS_OPTIONS.map(s => (
                                <div key={s} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setStatusFilterSet(prev => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; }); }} style={{ background: statusFilterSet.has(s) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{s} {statusFilterSet.has(s) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                            <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setStatusFilterSet(prev => { const next = new Set(prev); if (next.has(INVOICE_FAVORITES_VALUE)) next.delete(INVOICE_FAVORITES_VALUE); else next.add(INVOICE_FAVORITES_VALUE); return next; }); }} style={{ background: statusFilterSet.has(INVOICE_FAVORITES_VALUE) ? 'var(--color-bg-hover)' : undefined }}>
                                <Typography.Body>Избранные {statusFilterSet.has(INVOICE_FAVORITES_VALUE) ? '✓' : ''}</Typography.Body>
                            </div>
                        </FilterDropdownPortal>
                        <div ref={deliveryStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDeliveryStatusDropdownOpen(!isDeliveryStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsRouteCargoDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
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
                            <Button className="filter-button" onClick={() => { setIsRouteCargoDropdownOpen(!isRouteCargoDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsActCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsEdoStatusDropdownOpen(false); setIsTransportDropdownOpen(false); }}>
                                Маршрут: {routeFilterCargo === 'all' ? 'Все' : routeFilterCargo} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={routeCargoButtonRef} isOpen={isRouteCargoDropdownOpen} onClose={() => setIsRouteCargoDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('all'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('MSK – KGD'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>MSK – KGD</Typography.Body></div>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('KGD – MSK'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>KGD – MSK</Typography.Body></div>
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
            </div>
            {docSection === 'Счета' && (
            <>
            {!loading && !error && filteredItems.length > 0 && (
                <DocumentsSummaryCard
                    sum={documentsSummary.sum}
                    count={documentsSummary.count}
                    showSums={showSums}
                />
            )}
            {(loading || !!error) && <DocumentsStateBlocks loading={loading} error={error} emptyText="" />}
            {!loading && !error && tableModeEffective && sortedGroupedByCustomer.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('customer')} title="Сортировка">Заказчик {tableSortColumn === 'customer' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {showSums && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('sum')} title="Сортировка">Сумма {tableSortColumn === 'sum' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('count')} title="Сортировка">Счетов {tableSortColumn === 'count' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedGroupedByCustomer.map((row, i) => (
                                <React.Fragment key={i}>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedTableCustomer === row.customer ? 'var(--color-bg-hover)' : undefined }} onClick={() => setExpandedTableCustomer(prev => prev === row.customer ? null : row.customer)} title={expandedTableCustomer === row.customer ? 'Свернуть' : 'Показать счета'}>
                                        <td style={{ padding: '0.5rem 0.4rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo(row.customer)}>{stripOoo(row.customer)}</td>
                                        {showSums && <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum)}</td>}
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.items.length}</td>
                                    </tr>
                                    {expandedTableCustomer === row.customer && (
                                        <tr key={`${i}-detail`}>
                                            <td colSpan={showSums ? 3 : 2} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                    <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('number'); }} title="Сортировка">Номер {innerTableSortColumn === 'number' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} className="doc-inner-table-date" onClick={(e) => { e.stopPropagation(); handleInnerTableSort('date'); }} title="Сортировка">Дата {innerTableSortColumn === 'date' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('status'); }} title="Сортировка">Статус {innerTableSortColumn === 'status' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('deliveryStatus'); }} title="Сортировка">Статус перевозки {innerTableSortColumn === 'deliveryStatus' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} className="doc-inner-table-route" onClick={(e) => { e.stopPropagation(); handleInnerTableSort('route'); }} title="Сортировка">Маршрут {innerTableSortColumn === 'route' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                {showSums && <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('sum'); }} title="Сортировка">Сумма {innerTableSortColumn === 'sum' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sortInvoices(row.items).map((inv: any, j: number) => {
                                                                const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '';
                                                                const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '';
                                                                const isum = inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount ?? 0;
                                                                const ist = normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                                                                const istBadgeStyle = ist === 'Оплачен' ? { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' } : ist === 'Оплачен частично' ? { bg: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' } : ist === 'Не оплачен' ? { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' } : { bg: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)' };
                                                                const firstCargoNum = getFirstCargoNumberFromInvoice(inv);
                                                                const deliveryState = firstCargoNum ? cargoStateByNumber.get(normCargoKey(firstCargoNum)) : undefined;
                                                                return (
                                                                    <tr key={inum || j} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setSelectedInvoice(inv); }} title="Открыть счёт">
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{formatInvoiceNumber(inum)}</td>
                                                                        <td className="doc-inner-table-date" style={{ padding: '0.35rem 0.3rem' }}><DateText value={typeof idt === 'string' ? idt : idt ? String(idt) : undefined} /></td>
                                                                        <td className="doc-inner-table-status" style={{ padding: '0.35rem 0.3rem' }}>{ist ? <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: istBadgeStyle.bg, color: istBadgeStyle.color, border: '1px solid var(--color-border)', whiteSpace: 'nowrap', display: 'inline-block' }}>{ist}</span> : '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>
                                                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <StatusBadge status={deliveryState} />}
                                                                        </td>
                                                                        <td className="doc-inner-table-route" style={{ padding: '0.35rem 0.3rem' }}>
                                                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary-blue)', border: '1px solid rgba(59, 130, 246, 0.4)', whiteSpace: 'nowrap', display: 'inline-block' }}>{(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || '—'}</span>}
                                                                        </td>
                                                                        {showSums && <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{isum != null ? formatCurrency(isum) : '—'}</td>}
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!loading && !error && filteredItems.length > 0 && !tableModeEffective && (
                <div className="cargo-list">
                    {filteredItems.map((row, idx) => {
                        const num = row.Number ?? row.number ?? row.Номер ?? row.N ?? '';
                        const dt = row.DateDoc ?? row.Date ?? row.date ?? row.Дата ?? '';
                        const payTill = getPayTillDate(typeof dt === 'string' ? dt : dt ? String(dt) : undefined);
                        const cust = row.Customer ?? row.customer ?? row.Контрагент ?? row.Contractor ?? row.Organization ?? '';
                        const sum = row.SumDoc ?? row.Sum ?? row.sum ?? row.Сумма ?? row.Amount ?? 0;
                        const rawStatus = row.Status ?? row.State ?? row.state ?? row.Статус ?? '';
                        const st = (normalizeInvoiceStatus(rawStatus) || rawStatus) as string;
                        const badgeStyle = st === 'Оплачен' ? { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' } : st === 'Оплачен частично' ? { bg: 'rgba(234, 179, 8, 0.2)', color: '#ca8a04' } : st === 'Не оплачен' ? { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' } : { bg: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)' };
                        return (
                            <Panel key={num || idx} className="cargo-card" onClick={() => setSelectedInvoice(row)} style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative' }}>
                                <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                                    <Flex align="center" gap="0.5rem" style={{ flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0, maxWidth: '60%' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: badgeStyle.color }}>{formatInvoiceNumber(num)}</Typography.Body>
                                    </Flex>
                                    <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                                        <Button style={{ padding: '0.25rem', minWidth: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); const lines = [`Счёт: ${formatInvoiceNumber(num)}`, cust && `Заказчик: ${stripOoo(String(cust))}`, sum != null && `Сумма: ${formatCurrency(sum)}`, dt && `Дата: ${typeof dt === 'string' ? dt : String(dt)}`, payTill && `Оплата до: ${payTill}`].filter(Boolean); const text = lines.join('\n'); if (typeof navigator !== 'undefined' && (navigator as any).share) { (navigator as any).share({ title: `Счёт ${formatInvoiceNumber(num)}`, text }).catch(() => {}); } else { try { navigator.clipboard?.writeText(text); } catch {} } }} title="Поделиться"><Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} /></Button>
                                        <Button style={{ padding: '0.25rem', minWidth: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); toggleInvoiceFavorite(String(num || '')); }} title={isInvoiceFavorite(String(num || '')) ? 'Удалить из избранного' : 'В избранное'}>
                                            <Heart className="w-4 h-4" style={{ fill: isInvoiceFavorite(String(num || '')) ? '#ef4444' : 'transparent', color: isInvoiceFavorite(String(num || '')) ? '#ef4444' : 'var(--color-text-secondary)' }} />
                                        </Button>
                                        <Calendar className="w-4 h-4 text-theme-secondary" />
                                        <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem' }}>
                                            <DateText value={typeof dt === 'string' ? dt : dt ? String(dt) : undefined} />
                                        </Typography.Label>
                                    </Flex>
                                </Flex>
                                <Flex justify="space-between" align="center" style={{ marginBottom: '0.5rem' }}>
                                    {st && <span className="role-badge" style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: '999px', background: badgeStyle.bg, color: badgeStyle.color, border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{st}</span>}
                                    <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{sum != null ? formatCurrency(sum) : '—'}</Typography.Body>
                                </Flex>
                                <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    <Typography.Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={stripOoo(String(cust || ''))}>{stripOoo(String(cust || '—'))}</Typography.Label>
                                    {(row.AK === true || row.AK === 'true' || row.AK === '1' || row.AK === 1) && <Ship className="w-4 h-4" style={{ flexShrink: 0, color: 'var(--color-primary-blue)' }} title="Паром" />}
                                    {!(row?.AK === true || row?.AK === 'true' || row?.AK === '1' || row?.AK === 1) && (row.CitySender || row.CityReceiver) && (
                                        <Typography.Label style={{ fontSize: '0.85rem' }}>{[cityToCode(row.CitySender), cityToCode(row.CityReceiver)].filter(Boolean).join(' – ') || ''}</Typography.Label>
                                    )}
                                </Flex>
                                {payTill && (
                                    <Flex align="center" gap="0.35rem" style={{ fontSize: '0.8rem', color: getPayTillDateColor(payTill, st === 'Оплачен') ?? 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                                        <Typography.Label>Оплата до:</Typography.Label>
                                        <DateText value={payTill} />
                                    </Flex>
                                )}
                            </Panel>
                        );
                    })}
                </div>
            )}
            {selectedInvoice && (
                <InvoiceDetailModal
                    item={selectedInvoice}
                    isOpen={!!selectedInvoice}
                    onClose={() => setSelectedInvoice(null)}
                    onOpenCargo={(cargoNumber) => {
                        setSelectedInvoice(null);
                        setTimeout(() => onOpenCargo?.(cargoNumber), 0);
                    }}
                    auth={auth}
                    cargoStateByNumber={cargoStateByNumber}
                    cargoRouteByNumber={cargoRouteByNumber}
                    perevozkiLoading={perevozkiLoading}
                />
            )}
            {!loading && !error && filteredItems.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет счетов за выбранный период</Typography.Body>
            )}
            </>
            )}
            {docSection === 'УПД' && (
            <>
            {!actsLoading && !actsError && filteredActs.length > 0 && (
                <DocumentsSummaryCard
                    sum={actsSummary.sum}
                    count={actsSummary.count}
                    showSums={showSums}
                />
            )}
            {(actsLoading || !!actsError) && <DocumentsStateBlocks loading={actsLoading} error={actsError} emptyText="" />}
            {!actsLoading && !actsError && tableModeEffective && sortedGroupedActsByCustomer.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('customer')} title="Сортировка">Заказчик {tableSortColumn === 'customer' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {showSums && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('sum')} title="Сортировка">Сумма {tableSortColumn === 'sum' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('count')} title="Сортировка">УПД {tableSortColumn === 'count' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedGroupedActsByCustomer.map((row, i) => (
                                <React.Fragment key={i}>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedTableActCustomer === row.customer ? 'var(--color-bg-hover)' : undefined }} onClick={() => setExpandedTableActCustomer(prev => prev === row.customer ? null : row.customer)} title={expandedTableActCustomer === row.customer ? 'Свернуть' : 'Показать УПД'}>
                                        <td style={{ padding: '0.5rem 0.4rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo(row.customer)}>{stripOoo(row.customer)}</td>
                                        {showSums && <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum)}</td>}
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.items.length}</td>
                                    </tr>
                                    {expandedTableActCustomer === row.customer && (
                                        <tr key={`${i}-detail`}>
                                            <td colSpan={showSums ? 3 : 2} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                    <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableActSort('number'); }} title="Сортировка">Номер {innerTableActSortColumn === 'number' && (innerTableActSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} className="doc-inner-table-date" onClick={(e) => { e.stopPropagation(); handleInnerTableActSort('date'); }} title="Сортировка">Дата {innerTableActSortColumn === 'date' && (innerTableActSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableActSort('invoice'); }} title="Сортировка">Счёт {innerTableActSortColumn === 'invoice' && (innerTableActSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                {showSums && <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableActSort('sum'); }} title="Сортировка">Сумма {innerTableActSortColumn === 'sum' && (innerTableActSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sortActs(row.items).map((act: any, j: number) => {
                                                                const anum = act.Number ?? act.number ?? '';
                                                                const adt = act.DateDoc ?? act.Date ?? act.date ?? '';
                                                                const ainv = act.Invoice ?? act.invoice ?? act.Счёт ?? '';
                                                                const asum = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
                                                                return (
                                                                    <tr key={anum || j} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setSelectedAct(act); }} title="Открыть УПД">
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{formatInvoiceNumber(String(anum))}</td>
                                                                        <td className="doc-inner-table-date" style={{ padding: '0.35rem 0.3rem' }}><DateText value={typeof adt === 'string' ? adt : adt ? String(adt) : undefined} /></td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{ainv ? formatInvoiceNumber(String(ainv)) : '—'}</td>
                                                                        {showSums && <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{asum != null ? formatCurrency(asum) : '—'}</td>}
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!actsLoading && !actsError && filteredActs.length > 0 && !tableModeEffective && (
                <div className="cargo-list">
                    {filteredActs.map((act: any, idx: number) => {
                        const num = act.Number ?? act.number ?? '';
                        const dateDoc = act.DateDoc ?? act.Date ?? act.date ?? '';
                        const sumDoc = act.SumDoc ?? act.Sum ?? act.sum ?? 0;
                        const cust = act.Customer ?? act.customer ?? act.Контрагент ?? act.Contractor ?? act.Organization ?? '';
                        const invoiceNum = act.Invoice ?? act.invoice ?? '';
                        return (
                            <Panel key={num || idx} className="cargo-card" onClick={() => setSelectedAct(act)} style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative' }}>
                                <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                                    <Flex align="center" gap="0.5rem" style={{ flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0, maxWidth: '60%' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{formatInvoiceNumber(String(num))}</Typography.Body>
                                    </Flex>
                                    <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                                        <Button style={{ padding: '0.25rem', minWidth: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); const lines = [`УПД: ${formatInvoiceNumber(String(num))}`, cust && `Заказчик: ${stripOoo(String(cust))}`, sumDoc != null && `Сумма: ${formatCurrency(sumDoc)}`, dateDoc && `Дата: ${typeof dateDoc === 'string' ? dateDoc : String(dateDoc)}`, invoiceNum && `Счёт: ${formatInvoiceNumber(String(invoiceNum))}`].filter(Boolean); const text = lines.join('\n'); if (typeof navigator !== 'undefined' && (navigator as any).share) { (navigator as any).share({ title: `УПД ${formatInvoiceNumber(String(num))}`, text }).catch(() => {}); } else { try { navigator.clipboard?.writeText(text); } catch {} } }} title="Поделиться"><Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} /></Button>
                                        <span style={{ padding: '0.25rem', display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)', opacity: 0.5 }} title="Избранное"><Heart className="w-4 h-4" /></span>
                                        <Calendar className="w-4 h-4 text-theme-secondary" />
                                        <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem' }}>
                                            <DateText value={typeof dateDoc === 'string' ? dateDoc : dateDoc ? String(dateDoc) : undefined} />
                                        </Typography.Label>
                                    </Flex>
                                </Flex>
                                {showSums && (
                                <Flex justify="space-between" align="center" style={{ marginBottom: '0.5rem' }}>
                                    <span />
                                    <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{sumDoc != null ? formatCurrency(sumDoc) : '—'}</Typography.Body>
                                </Flex>
                                )}
                                <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    <Typography.Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={stripOoo(String(cust || ''))}>{stripOoo(String(cust || '—'))}</Typography.Label>
                                    {(act.AK === true || act.AK === 'true' || act.AK === '1' || act.AK === 1) && <Ship className="w-4 h-4" style={{ flexShrink: 0, color: 'var(--color-primary-blue)' }} title="Паром" />}
                                    {!(act?.AK === true || act?.AK === 'true' || act?.AK === '1' || act?.AK === 1) && (act.CitySender || act.CityReceiver) && (
                                        <Typography.Label style={{ fontSize: '0.85rem' }}>{[cityToCode(act.CitySender), cityToCode(act.CityReceiver)].filter(Boolean).join(' – ') || ''}</Typography.Label>
                                    )}
                                    {!(act?.AK === true || act?.AK === 'true' || act?.AK === '1' || act?.AK === 1) && !(act.CitySender || act.CityReceiver) && invoiceNum && (
                                        <Typography.Label style={{ fontSize: '0.85rem' }}>Счёт {formatInvoiceNumber(String(invoiceNum))}</Typography.Label>
                                    )}
                                </Flex>
                            </Panel>
                        );
                    })}
                </div>
            )}
            {!actsLoading && !actsError && filteredActs.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет УПД за выбранный период</Typography.Body>
            )}
            {selectedAct && (
                <ActDetailModal
                    item={selectedAct}
                    isOpen={!!selectedAct}
                    onClose={() => setSelectedAct(null)}
                    onOpenInvoice={(inv) => {
                        setSelectedAct(null);
                        setDocSection('Счета');
                        setSelectedInvoice(inv);
                    }}
                    invoices={items}
                    onOpenCargo={(cargoNumber) => {
                        setSelectedAct(null);
                        setTimeout(() => onOpenCargo?.(cargoNumber), 0);
                    }}
                    auth={auth}
                />
            )}
            </>
            )}
            {docSection === 'Заявки' && (
            <>
            {(ordersLoading || !!ordersError) && <DocumentsStateBlocks loading={ordersLoading} error={ordersError} emptyText="" />}
            {!ordersLoading && !ordersError && orderRowsSorted.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('date')} title="Сортировка">Дата {ordersSortColumn === 'date' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('pickupDate')} title="Сортировка">Дата забора план {ordersSortColumn === 'pickupDate' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('number')} title="Сортировка">Номер заявки {ordersSortColumn === 'number' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('clientNumber')} title="Сортировка">Номер заявки заказчика {ordersSortColumn === 'clientNumber' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('cargo')} title="Сортировка">Номер перевозки {ordersSortColumn === 'cargo' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {effectiveServiceMode && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('customer')} title="Сортировка">Заказчик {ordersSortColumn === 'customer' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('sender')} title="Сортировка">Отправитель {ordersSortColumn === 'sender' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('receiver')} title="Сортировка">Получатель {ordersSortColumn === 'receiver' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('route')} title="Сортировка">Маршрут {ordersSortColumn === 'route' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {effectiveServiceMode && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('comment')} title="Сортировка">Комментарий {ordersSortColumn === 'comment' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {orderRowsSorted.map((row: any, idx: number) => {
                                const rawDate = row?.Дата ?? row?.DateZayavki ?? row?.Date ?? row?.date ?? '';
                                const requestNumber = String(row?.НомерЗаявки ?? row?.Номер ?? row?.Number ?? row?.number ?? row?.N ?? '');
                                const parcels = getRequestParcels(row);
                                const searchLower = effectiveSearchText.trim().toLowerCase();
                                const parcelMatches = searchLower ? parcels.filter((parcel: any) => getParcelSearchText(parcel).includes(searchLower)) : [];
                                const hasParcelSearchMatches = !!searchLower && parcelMatches.length > 0;
                                const parcelsToRender = hasParcelSearchMatches ? parcelMatches : parcels;
                                const sortedParcelsToRender = [...parcelsToRender].sort((a: any, b: any) => {
                                    const goodsA = Array.isArray(a?.Товары) ? (a.Товары[0] ?? {}) : (a?.Товары && typeof a.Товары === 'object' ? a.Товары : a);
                                    const goodsB = Array.isArray(b?.Товары) ? (b.Товары[0] ?? {}) : (b?.Товары && typeof b.Товары === 'object' ? b.Товары : b);
                                    const toNumber = (v: unknown) => {
                                        const n = Number(String(v ?? '').replace(',', '.'));
                                        return Number.isFinite(n) ? n : 0;
                                    };
                                    let cmp = 0;
                                    switch (ordersParcelsSortColumn) {
                                        case 'parcel':
                                            cmp = String(a?.ПосылкаНаименование ?? a?.Посылка ?? a?.ИДОтправления ?? '').localeCompare(String(b?.ПосылкаНаименование ?? b?.Посылка ?? b?.ИДОтправления ?? ''), undefined, { numeric: true });
                                            break;
                                        case 'cargo':
                                            cmp = String(a?.Перевозка ?? '').localeCompare(String(b?.Перевозка ?? ''), undefined, { numeric: true });
                                            break;
                                        case 'tmc':
                                            cmp = String(goodsA?.ТМЦ ?? '').localeCompare(String(goodsB?.ТМЦ ?? ''));
                                            break;
                                        case 'consolidation':
                                            cmp = String(goodsA?.ИДОтправления ?? '').localeCompare(String(goodsB?.ИДОтправления ?? ''), undefined, { numeric: true });
                                            break;
                                        case 'count':
                                            cmp = toNumber(goodsA?.Количество) - toNumber(goodsB?.Количество);
                                            break;
                                        case 'cost':
                                            cmp = toNumber(goodsA?.ОбъявленнаяСтоимостьТовараДляПечати ?? goodsA?.ОбъявленнаяСтоимостьТовара) - toNumber(goodsB?.ОбъявленнаяСтоимостьТовараДляПечати ?? goodsB?.ОбъявленнаяСтоимостьТовара);
                                            break;
                                    }
                                    return ordersParcelsSortOrder === 'asc' ? cmp : -cmp;
                                });
                                const cargoNumber = String(
                                    row?.НомерПеревозки ??
                                    row?.Перевозка ??
                                    row?.CargoNumber ??
                                    row?.NumberPerevozki ??
                                    parcels?.[0]?.Перевозка ??
                                    ''
                                );
                                const customer = String(row?.ЗаказчикНаименование ?? row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '');
                                const receiver = String(row?.ПолучательНаименование ?? row?.Получатель ?? row?.Receiver ?? row?.receiver ?? '');
                                const sender = String(row?.ОтправительНаименование ?? row?.Отправитель ?? row?.Sender ?? row?.sender ?? '');
                                const comment = String(row?.Комментарий ?? row?.Comment ?? '');
                                const customerRequestNumber = String(row?.НомерЗаявкиКлиента ?? row?.ClientRequestNumber ?? '');
                                const pickupDate = String(row?.ДатаЗабораПлан ?? row?.PickupDatePlan ?? '');
                                const rowKey = `${requestNumber || 'row'}-${cargoNumber || idx}`;
                                const expanded = expandedOrderRow === rowKey;
                                const senderPoint = String(row?.ПунктОтправкиНаименование ?? row?.ПунктОтправки ?? row?.ПунктОтправления ?? row?.АдресОтправки ?? row?.SenderPoint ?? '');
                                const destinationPoint = String(row?.ПунктНазначенияНаименование ?? row?.ПунктНазначения ?? row?.ПунктДоставки ?? row?.ReceiverPoint ?? row?.DestinationPoint ?? '');
                                const route = [cityToCode(senderPoint) || senderPoint, cityToCode(destinationPoint) || destinationPoint].filter(Boolean).join(' – ') || '—';
                                return (
                                    <React.Fragment key={rowKey}>
                                        <tr
                                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expanded ? 'var(--color-bg-hover)' : undefined }}
                                            onClick={() => setExpandedOrderRow((prev) => (prev === rowKey ? null : rowKey))}
                                            title={expanded ? 'Свернуть' : 'Показать детали заявки'}
                                        >
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={rawDate ? String(rawDate) : undefined} /></td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={pickupDate || undefined} /></td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{requestNumber ? formatInvoiceNumber(requestNumber) : '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{customerRequestNumber || '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{cargoNumber ? formatInvoiceNumber(cargoNumber) : '—'}</td>
                                            {effectiveServiceMode && (
                                                <td
                                                    style={{
                                                        padding: '0.5rem 0.4rem',
                                                        maxWidth: 220,
                                                        verticalAlign: 'top',
                                                    }}
                                                    title={customer || '—'}
                                                >
                                                    <div
                                                        style={{
                                                            overflow: 'hidden',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                        }}
                                                    >
                                                        {customer || '—'}
                                                    </div>
                                                </td>
                                            )}
                                            <td
                                                style={{
                                                    padding: '0.5rem 0.4rem',
                                                    maxWidth: 220,
                                                    verticalAlign: 'top',
                                                }}
                                                title={sender || '—'}
                                            >
                                                <div
                                                    style={{
                                                        overflow: 'hidden',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                    }}
                                                >
                                                    {sender || '—'}
                                                </div>
                                            </td>
                                            <td
                                                style={{
                                                    padding: '0.5rem 0.4rem',
                                                    maxWidth: 220,
                                                    verticalAlign: 'top',
                                                }}
                                                title={receiver || '—'}
                                            >
                                                <div
                                                    style={{
                                                        overflow: 'hidden',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                    }}
                                                >
                                                    {receiver || '—'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>
                                                <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary-blue)', border: '1px solid rgba(59, 130, 246, 0.4)', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                                    {route}
                                                </span>
                                            </td>
                                            {effectiveServiceMode && <td style={{ padding: '0.5rem 0.4rem' }}>{comment || '—'}</td>}
                                        </tr>
                                        {expanded && (
                                            <tr>
                                                <td colSpan={effectiveServiceMode ? 10 : 8} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                    <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 220px) 1fr', gap: '0.35rem 0.75rem', fontSize: '0.85rem' }}>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Заказчик:</Typography.Body>
                                                            <Typography.Body>{customer || '—'}</Typography.Body>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Пункт отправки:</Typography.Body>
                                                            <Typography.Body>{senderPoint || '—'}</Typography.Body>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Отправитель:</Typography.Body>
                                                            <Typography.Body>{sender || '—'}</Typography.Body>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Пункт назначения:</Typography.Body>
                                                            <Typography.Body>{destinationPoint || '—'}</Typography.Body>
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Получатель:</Typography.Body>
                                                            <Typography.Body>{receiver || '—'}</Typography.Body>
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                        {parcelsToRender.length === 0 ? (
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.5rem 0.25rem' }}>Нет данных по посылкам</Typography.Body>
                                                        ) : (
                                                            <>
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('parcel'); }} title="Сортировка">Посылка {ordersParcelsSortColumn === 'parcel' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('cargo'); }} title="Сортировка">Консолидация {ordersParcelsSortColumn === 'cargo' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('tmc'); }} title="Сортировка">Номенклатура {ordersParcelsSortColumn === 'tmc' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('consolidation'); }} title="Сортировка">Консолидация {ordersParcelsSortColumn === 'consolidation' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('count'); }} title="Сортировка">Кол-во {ordersParcelsSortColumn === 'count' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('cost'); }} title="Сортировка">Стоимость {ordersParcelsSortColumn === 'cost' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {sortedParcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                                        const goodsRaw = parcel?.Товары;
                                                                        const goods = Array.isArray(goodsRaw)
                                                                            ? (goodsRaw[0] ?? {})
                                                                            : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : parcel);
                                                                        return (
                                                                            <tr
                                                                                key={`${rowKey}-parcel-${parcel?.Посылка ?? parcelIdx}`}
                                                                                style={{
                                                                                    borderBottom: '1px solid var(--color-border)',
                                                                                    background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                }}
                                                                            >
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? parcel?.Посылка ?? parcel?.ИДОтправления ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.Перевозка ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem' }}>{goods?.ТМЦ ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{goods?.ИДОтправления ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.ОбъявленнаяСтоимостьТовараДляПечати ?? goods?.ОбъявленнаяСтоимостьТовара ?? '—'}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                            </>
                                                        )}
                                                    </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {!ordersLoading && !ordersError && orderRowsSorted.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет заявок за выбранный период</Typography.Body>
            )}
            </>
            )}
            {docSection === 'Отправки' && (
            <>
            {(sendingsLoading || !!sendingsError) && <DocumentsStateBlocks loading={sendingsLoading} error={sendingsError} emptyText="" />}
            {!sendingsLoading && !sendingsError && sendingRowsSorted.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('date')} title="Сортировка">Дата {sendingsSortColumn === 'date' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('number')} title="Сортировка">Номер {sendingsSortColumn === 'number' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('route')} title="Сортировка">Маршрут {sendingsSortColumn === 'route' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'center', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('type')} title="Сортировка">Тип {sendingsSortColumn === 'type' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('vehicle')} title="Сортировка">Транспортное средство {sendingsSortColumn === 'vehicle' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('comment')} title="Сортировка">Комментарий {sendingsSortColumn === 'comment' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sendingRowsSorted.map((row: any, idx: number) => {
                                const rawDate = row?.Дата ?? row?.Date ?? row?.date ?? '';
                                const number = String(row?.Номер ?? row?.Number ?? row?.number ?? '');
                                const vehicle = normalizeTransportDisplay(row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.AutoType ?? '');
                                const comment = String(row?.Комментарий ?? row?.Comment ?? '');
                                const rowKey = number || `${idx}`;
                                const parcels = getRequestParcels(row);
                                const searchLower = effectiveSearchText.trim().toLowerCase();
                                const parcelMatches = searchLower ? parcels.filter((parcel: any) => getParcelSearchText(parcel).includes(searchLower)) : [];
                                const hasParcelSearchMatches = !!searchLower && parcelMatches.length > 0;
                                const parcelsToRender = hasParcelSearchMatches ? parcelMatches : parcels;
                                const transportType = getSendingTransportType(vehicle);
                                const routeFrom = String(row?.ПунктОтправленияГородАэропорт ?? row?.CitySender ?? row?.ГородОтправления ?? '').trim();
                                const routeTo = String(row?.ПунктНазначенияГородАэропорт ?? row?.CityReceiver ?? row?.ГородНазначения ?? '').trim();
                                const route = [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(' – ') || [routeFrom, routeTo].filter(Boolean).join(' – ') || '—';
                                const expanded = expandedSendingRow === rowKey;
                                return (
                                    <React.Fragment key={rowKey}>
                                        <tr
                                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expanded ? 'var(--color-bg-hover)' : undefined }}
                                            onClick={() => setExpandedSendingRow((prev) => (prev === rowKey ? null : rowKey))}
                                            title={expanded ? 'Свернуть посылки' : 'Показать посылки'}
                                        >
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={rawDate ? String(rawDate) : undefined} /></td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{number ? formatInvoiceNumber(number) : '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>
                                                <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary-blue)', border: '1px solid rgba(59, 130, 246, 0.4)', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                                    {route}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', textAlign: 'center' }}>
                                                {transportType === 'ferry' ? (
                                                    <Ship className="w-4 h-4" style={{ color: 'var(--color-primary-blue)', display: 'inline-block' }} title="Паром" />
                                                ) : transportType === 'auto' ? (
                                                    <Truck className="w-4 h-4" style={{ color: 'var(--color-text-secondary)', display: 'inline-block' }} title="Авто" />
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>{vehicle || '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>{comment || '—'}</td>
                                        </tr>
                                        {expanded && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                    <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'general' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'general' ? '#fff' : undefined }}
                                                                onClick={(e) => { e.stopPropagation(); setSendingsDetailsView('general'); }}
                                                            >
                                                                Общий
                                                            </Button>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCargo' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCargo' ? '#fff' : undefined }}
                                                                onClick={(e) => { e.stopPropagation(); setSendingsDetailsView('byCargo'); }}
                                                            >
                                                                По перевозкам
                                                            </Button>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCustomer' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCustomer' ? '#fff' : undefined }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSendingsDetailsView('byCustomer');
                                                                    setSendingsSummarySortColumn('customer');
                                                                    setSendingsSummarySortOrder('asc');
                                                                }}
                                                            >
                                                                По заказчику
                                                            </Button>
                                                        </div>
                                                        {parcelsToRender.length === 0 ? (
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.5rem 0.25rem' }}>Нет данных по посылкам</Typography.Body>
                                                        ) : sendingsDetailsView === 'general' ? (
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>№ пп</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Консолидация</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Посылка</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Консолидация</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Вес</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Объем</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Платный вес</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Номенклатура</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>Кол-во</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Стоимость</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {parcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                                        const goodsRaw = parcel?.Товары;
                                                                        const goods = Array.isArray(goodsRaw) ? goodsRaw[0] : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : {});
                                                                        return (
                                                                            <tr
                                                                                key={`${rowKey}-parcel-${parcel?.Посылка ?? parcelIdx}`}
                                                                                style={{
                                                                                    borderBottom: '1px solid var(--color-border)',
                                                                                    background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                }}
                                                                            >
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{goods?.ИДОтправления ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.Перевозка ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ВесДляОтчета ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ОбъемДляОтчета ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ПлатныйВес ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem' }}>{goods?.ТМЦ ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.ОбъявленнаяСтоимостьТовараДляПечати ?? goods?.ОбъявленнаяСтоимостьТовара ?? '—'}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        ) : sendingsDetailsView === 'byCargo' ? (
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('index')} title="Сортировка">№ пп {sendingsSummarySortColumn === 'index' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('cargo')} title="Сортировка">Консолидация {sendingsSummarySortColumn === 'cargo' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('count')} title="Сортировка">Кол-во {sendingsSummarySortColumn === 'count' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('volume')} title="Сортировка">Объем {sendingsSummarySortColumn === 'volume' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('weight')} title="Сортировка">Вес {sendingsSummarySortColumn === 'weight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('paidWeight')} title="Сортировка">Платный вес {sendingsSummarySortColumn === 'paidWeight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('customer')} title="Сортировка">Заказчик {sendingsSummarySortColumn === 'customer' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(() => {
                                                                        const toNumber = (v: unknown) => {
                                                                            const raw = String(v ?? '').trim().replace(',', '.');
                                                                            const n = Number(raw);
                                                                            return Number.isFinite(n) ? n : 0;
                                                                        };
                                                                        const formatNum = (n: number) => {
                                                                            if (!Number.isFinite(n)) return '—';
                                                                            const fixed = n.toFixed(3);
                                                                            return fixed.replace(/\.?0+$/, '');
                                                                        };
                                                                        const byCargo = new Map<string, { cargo: string; count: number; volume: number; weight: number; paidWeight: number }>();
                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                            const cargo = String(parcel?.Перевозка ?? '').trim() || '—';
                                                                            const prev = byCargo.get(cargo) ?? { cargo, count: 0, volume: 0, weight: 0, paidWeight: 0 };
                                                                            prev.count += 1;
                                                                            prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                            prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                            prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                            byCargo.set(cargo, prev);
                                                                        });
                                                                        const summaryRows = Array.from(byCargo.values()).map((summary, index) => {
                                                                            const cargoKey = normCargoKey(summary.cargo);
                                                                            const sendingCustomer = cargoCustomerByNumber.get(cargoKey)
                                                                                || String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '');
                                                                            return { ...summary, customer: sendingCustomer, _index: index + 1 };
                                                                        });
                                                                        const sortedSummaryRows = [...summaryRows].sort((a, b) => {
                                                                            let cmp = 0;
                                                                            switch (sendingsSummarySortColumn) {
                                                                                case 'index':
                                                                                    cmp = a._index - b._index;
                                                                                    break;
                                                                                case 'cargo':
                                                                                    cmp = a.cargo.localeCompare(b.cargo, undefined, { numeric: true });
                                                                                    break;
                                                                                case 'count':
                                                                                    cmp = a.count - b.count;
                                                                                    break;
                                                                                case 'volume':
                                                                                    cmp = a.volume - b.volume;
                                                                                    break;
                                                                                case 'weight':
                                                                                    cmp = a.weight - b.weight;
                                                                                    break;
                                                                                case 'paidWeight':
                                                                                    cmp = a.paidWeight - b.paidWeight;
                                                                                    break;
                                                                                case 'customer':
                                                                                    cmp = String(a.customer || '').localeCompare(String(b.customer || ''));
                                                                                    break;
                                                                            }
                                                                            return sendingsSummarySortOrder === 'asc' ? cmp : -cmp;
                                                                        });
                                                                        const totals = summaryRows.reduce(
                                                                            (acc, s) => {
                                                                                acc.count += s.count;
                                                                                acc.volume += s.volume;
                                                                                acc.weight += s.weight;
                                                                                acc.paidWeight += s.paidWeight;
                                                                                return acc;
                                                                            },
                                                                            { count: 0, volume: 0, weight: 0, paidWeight: 0 }
                                                                        );
                                                                        return (
                                                                            <>
                                                                                {sortedSummaryRows.map((summary, parcelIdx: number) => {
                                                                                    return (
                                                                                        <tr
                                                                                            key={`${rowKey}-summary-${summary.cargo}-${parcelIdx}`}
                                                                                            style={{
                                                                                                borderBottom: '1px solid var(--color-border)',
                                                                                                background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                            }}
                                                                                        >
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>
                                                                                                {summary.cargo && summary.cargo !== '—' ? (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        style={{ border: 'none', background: 'transparent', padding: 0, color: 'var(--color-primary-blue)', cursor: 'pointer', textDecoration: 'underline' }}
                                                                                                        onClick={(e) => { e.stopPropagation(); onOpenCargo?.(String(summary.cargo)); }}
                                                                                                        title="Открыть перевозку в Грузах"
                                                                                                    >
                                                                                                        {summary.cargo}
                                                                                                    </button>
                                                                                                ) : '—'}
                                                                                            </td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{summary.count}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.volume)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.weight)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.paidWeight)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem' }}>{summary.customer || '—'}</td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                                <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 700 }} colSpan={2}>Итого</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{totals.count}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.volume)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.weight)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.paidWeight)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', fontWeight: 700 }}>—</td>
                                                                                </tr>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <>
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('index')} title="Сортировка">№ пп {sendingsSummarySortColumn === 'index' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('customer')} title="Сортировка">Заказчик {sendingsSummarySortColumn === 'customer' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('count')} title="Сортировка">Кол-во {sendingsSummarySortColumn === 'count' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('volume')} title="Сортировка">Объем {sendingsSummarySortColumn === 'volume' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('weight')} title="Сортировка">Вес {sendingsSummarySortColumn === 'weight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('paidWeight')} title="Сортировка">Платный вес {sendingsSummarySortColumn === 'paidWeight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>Плотность</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(() => {
                                                                        const toNumber = (v: unknown) => {
                                                                            const raw = String(v ?? '').trim().replace(',', '.');
                                                                            const n = Number(raw);
                                                                            return Number.isFinite(n) ? n : 0;
                                                                        };
                                                                        const formatNum = (n: number) => {
                                                                            if (!Number.isFinite(n)) return '—';
                                                                            const fixed = n.toFixed(3);
                                                                            return fixed.replace(/\.?0+$/, '');
                                                                        };
                                                                        const densityOf = (weight: number, volume: number) => {
                                                                            if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume <= 0) return '—';
                                                                            return formatNum(weight / volume);
                                                                        };
                                                                        const densityColor = (weight: number, volume: number) => {
                                                                            if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume <= 0) return 'var(--color-text-secondary)';
                                                                            const density = weight / volume;
                                                                            if (density >= 180 && density <= 220) return '#16a34a';
                                                                            if ((density >= 150 && density < 180) || (density > 220 && density <= 260)) return '#ca8a04';
                                                                            return '#dc2626';
                                                                        };
                                                                        const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                        const byCustomer = new Map<string, { customer: string; count: number; volume: number; weight: number; paidWeight: number }>();
                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                            const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                            const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                            const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                            const customer = customerFromParcel || customerFromCargo || rowDefaultCustomer;
                                                                            const prev = byCustomer.get(customer) ?? { customer, count: 0, volume: 0, weight: 0, paidWeight: 0 };
                                                                            prev.count += 1;
                                                                            prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                            prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                            prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                            byCustomer.set(customer, prev);
                                                                        });
                                                                        const summaryRows = Array.from(byCustomer.values()).map((summary, index) => ({ ...summary, _index: index + 1 }));
                                                                        const sortedSummaryRows = [...summaryRows].sort((a, b) => {
                                                                            let cmp = 0;
                                                                            switch (sendingsSummarySortColumn) {
                                                                                case 'index':
                                                                                    cmp = a._index - b._index;
                                                                                    break;
                                                                                case 'count':
                                                                                    cmp = a.count - b.count;
                                                                                    break;
                                                                                case 'volume':
                                                                                    cmp = a.volume - b.volume;
                                                                                    break;
                                                                                case 'weight':
                                                                                    cmp = a.weight - b.weight;
                                                                                    break;
                                                                                case 'paidWeight':
                                                                                    cmp = a.paidWeight - b.paidWeight;
                                                                                    break;
                                                                                case 'cargo':
                                                                                case 'customer':
                                                                                    cmp = String(a.customer || '').localeCompare(String(b.customer || ''));
                                                                                    break;
                                                                            }
                                                                            return sendingsSummarySortOrder === 'asc' ? cmp : -cmp;
                                                                        });
                                                                        const totals = summaryRows.reduce(
                                                                            (acc, s) => {
                                                                                acc.count += s.count;
                                                                                acc.volume += s.volume;
                                                                                acc.weight += s.weight;
                                                                                acc.paidWeight += s.paidWeight;
                                                                                return acc;
                                                                            },
                                                                            { count: 0, volume: 0, weight: 0, paidWeight: 0 }
                                                                        );
                                                                        return (
                                                                            <>
                                                                                {sortedSummaryRows.map((summary, parcelIdx: number) => (
                                                                                    <tr
                                                                                        key={`${rowKey}-summary-customer-${summary.customer}-${parcelIdx}`}
                                                                                        style={{
                                                                                            borderBottom: '1px solid var(--color-border)',
                                                                                            background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                        }}
                                                                                    >
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{summary.customer || '—'}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{summary.count}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.volume)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.weight)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.paidWeight)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', color: densityColor(summary.weight, summary.volume), fontWeight: 600 }}>{densityOf(summary.weight, summary.volume)}</td>
                                                                                    </tr>
                                                                                ))}
                                                                                <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 700 }} colSpan={2}>Итого</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{totals.count}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.volume)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.weight)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.paidWeight)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: densityColor(totals.weight, totals.volume) }}>{densityOf(totals.weight, totals.volume)}</td>
                                                                                </tr>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </tbody>
                                                            </table>
                                                            <Typography.Label
                                                                style={{
                                                                    display: 'block',
                                                                    marginTop: '0.5rem',
                                                                    fontSize: '0.75rem',
                                                                    color: 'var(--color-text-secondary)',
                                                                }}
                                                            >
                                                                Плотность (идеал 200):{' '}
                                                                <span style={{ color: '#16a34a', fontWeight: 600 }}>зелёный 180-220</span>,{' '}
                                                                <span style={{ color: '#ca8a04', fontWeight: 600 }}>жёлтый 150-179 / 221-260</span>,{' '}
                                                                <span style={{ color: '#dc2626', fontWeight: 600 }}>красный &lt;150 / &gt;260</span>
                                                            </Typography.Label>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {!sendingsLoading && !sendingsError && sendingRowsSorted.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет отправок за выбранный период</Typography.Body>
            )}
            </>
            )}
            {docSection !== 'Счета' && docSection !== 'УПД' && docSection !== 'Заявки' && docSection !== 'Отправки' && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0', fontSize: '0.9rem' }}>
                    Раздел «{docSection}» в разработке.
                </Typography.Body>
            )}
        </div>
    );
}
