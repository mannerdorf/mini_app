import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { FilterDialog } from "../components/shared/FilterDialog";
import { normalizeStatus, getFilterKeyByStatus, BILL_STATUS_MAP, STATUS_MAP } from "../lib/statusUtils";
import type { BillStatusFilterKey } from "../lib/statusUtils";
import type { WorkSchedule } from "../lib/slaWorkSchedule";
import * as dateUtils from "../lib/dateUtils";
import { formatCurrency, stripOoo, cityToCode } from "../lib/formatUtils";
import { PROXY_API_DOWNLOAD_URL } from "../constants/config";
import { DOCUMENT_METHODS } from "../documentMethods";
import type { AuthData, CargoItem, DateFilter, StatusFilter } from "../types";
import { useCargoDateRange } from "./useCargoDateRange";
import { useCargoDataLoad } from "./useCargoDataLoad";
import {
    buildFilteredCargoItems,
    buildCargoSummary,
    buildGroupedByCustomer,
    sortGroupedByCustomer,
} from "./cargoPipeline";
import { CargoSummaryCard, CargoStateBlocks } from "./cargoViewBlocks";
import { CargoCustomerTable, CargoCardsList } from "./cargoCollectionViews";

const { loadDateFilterState, saveDateFilterState, getDateRange, getWeekRange, getWeeksList, getYearsList, MONTH_NAMES, DEFAULT_DATE_FROM, DEFAULT_DATE_TO, formatDate } = dateUtils;
type CargoStatusFilterKey = Exclude<StatusFilter, "all" | "favorites">;
const CARGO_STATUS_FILTER_KEYS: CargoStatusFilterKey[] = ["in_transit", "ready", "delivering", "delivered"];

export type CargoDetailsModalProps = {
    item: CargoItem;
    isOpen: boolean;
    onClose: () => void;
    auth: AuthData;
    onOpenChat: (cargoNumber?: string) => void | Promise<void>;
    isFavorite: (cargoNumber: string | undefined) => boolean;
    onToggleFavorite: (cargoNumber: string | undefined) => void;
    showSums?: boolean;
    useServiceRequest?: boolean;
};

export type CargoPageProps = {
    /** Один или несколько аккаунтов — перевозки объединяются */
    auths: AuthData[];
    searchText: string;
    onOpenChat: (cargoNumber?: string) => void | Promise<void>;
    onCustomerDetected?: (customer: string) => void;
    contextCargoNumber?: string | null;
    onClearContextCargo?: () => void;
    roleCustomer?: boolean;
    roleSender?: boolean;
    roleReceiver?: boolean;
    useServiceRequest?: boolean;
    /** Скрыть финансовые данные (суммы, статус счёта) */
    showSums?: boolean;
    /** Modal component for cargo details (injected from App to avoid circular deps) */
    CargoDetailsModal: React.ComponentType<CargoDetailsModalProps>;
};

export function CargoPage({
    auths,
    searchText,
    onOpenChat,
    onCustomerDetected,
    contextCargoNumber,
    onClearContextCargo,
    roleCustomer = true,
    roleSender = true,
    roleReceiver = true,
    useServiceRequest = false,
    showSums = true,
    CargoDetailsModal,
}: CargoPageProps) {
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);

    // Filters State; при переключении вкладок восстанавливаем из localStorage
    const initDateCargo = () => loadDateFilterState();
    const [dateFilter, setDateFilter] = useState<DateFilter>(() => initDateCargo()?.dateFilter ?? "месяц");
    const [customDateFrom, setCustomDateFrom] = useState(() => initDateCargo()?.customDateFrom ?? DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(() => initDateCargo()?.customDateTo ?? DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months' | 'years' | 'weeks'>('main');
    const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(() => initDateCargo()?.selectedMonthForFilter ?? null);
    const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(() => initDateCargo()?.selectedYearForFilter ?? null);
    const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(() => initDateCargo()?.selectedWeekForFilter ?? null);
    useEffect(() => {
        saveDateFilterState({ dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter });
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const yearWasLongPressRef = useRef(false);
    const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const weekWasLongPressRef = useRef(false);
    const [workScheduleByInn, setWorkScheduleByInn] = useState<Record<string, WorkSchedule>>({});
    const [senderFilter, setSenderFilter] = useState<string>('');
    const [receiverFilter, setReceiverFilter] = useState<string>('');
    const [statusFilterSet, setStatusFilterSet] = useState<Set<CargoStatusFilterKey>>(() => new Set());
    const [billStatusFilterSet, setBillStatusFilterSet] = useState<Set<BillStatusFilterKey>>(() => new Set());
    const [typeFilterSet, setTypeFilterSet] = useState<Set<'ferry' | 'auto'>>(() => new Set());
    const [routeFilterSet, setRouteFilterSet] = useState<Set<'MSK-KGD' | 'KGD-MSK'>>(() => new Set());
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [isSenderDropdownOpen, setIsSenderDropdownOpen] = useState(false);
    const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
    const [isBillStatusDropdownOpen, setIsBillStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    /** В служебном режиме: табличный вид с суммированием по заказчику */
    const CARGO_TABLE_MODE_KEY = 'haulz.cargo.tableMode';
    const [tableModeByCustomer, setTableModeByCustomer] = useState<boolean>(() => {
        try {
            return localStorage.getItem(CARGO_TABLE_MODE_KEY) === 'true';
        } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem(CARGO_TABLE_MODE_KEY, String(tableModeByCustomer)); } catch { /* ignore */ }
    }, [tableModeByCustomer]);
    /** Сортировка таблицы по заказчику: столбец и направление (а-я / я-а) */
    const [tableSortColumn, setTableSortColumn] = useState<'customer' | 'sum' | 'mest' | 'pw' | 'w' | 'vol' | 'count'>('customer');
    const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
    /** Развёрнутая строка таблицы по заказчику: показываем детальные перевозки */
    const [expandedTableCustomer, setExpandedTableCustomer] = useState<string | null>(null);
    /** Сортировка вложенной таблицы перевозок (Номер, Дата прихода, Статус, Мест, Плат. вес, Сумма) */
    type InnerTableSortCol = 'number' | 'datePrih' | 'status' | 'mest' | 'pw' | 'sum';
    const [innerTableSortColumn, setInnerTableSortColumn] = useState<InnerTableSortCol | null>(null);
    const [innerTableSortOrder, setInnerTableSortOrder] = useState<'asc' | 'desc'>('asc');
    const dateButtonRef = useRef<HTMLDivElement>(null);
    const statusButtonRef = useRef<HTMLDivElement>(null);
    const senderButtonRef = useRef<HTMLDivElement>(null);
    const receiverButtonRef = useRef<HTMLDivElement>(null);
    const billStatusButtonRef = useRef<HTMLDivElement>(null);
    const typeButtonRef = useRef<HTMLDivElement>(null);
    const routeButtonRef = useRef<HTMLDivElement>(null);
    /** Расширяли ли уже фильтр дат для отображения перевозки по contextCargoNumber (из счёта) */
    const contextCargoWidenedRef = useRef(false);
    useEffect(() => {
        if (contextCargoNumber) contextCargoWidenedRef.current = false;
    }, [contextCargoNumber]);
    // Sort State
    const [sortBy, setSortBy] = useState<'datePrih' | 'dateVr' | null>('datePrih');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Favorites State
    const [favorites, setFavorites] = useState<Set<string>>(new Set());

    // Загружаем избранные из localStorage при монтировании
    useEffect(() => {
        try {
            const saved = localStorage.getItem('haulz.favorites');
            if (saved) {
                const parsed = JSON.parse(saved) as string[];
                setFavorites(new Set(parsed));
            }
        } catch {
            // Игнорируем ошибки чтения
        }
    }, []);

    // Сохраняем избранные в localStorage при изменении
    useEffect(() => {
        try {
            localStorage.setItem('haulz.favorites', JSON.stringify(Array.from(favorites)));
        } catch {
            // Игнорируем ошибки записи
        }
    }, [favorites]);

    // Функции для работы с избранными
    const toggleFavorite = useCallback((cargoNumber: string | undefined) => {
        if (!cargoNumber) return;
        setFavorites(prev => {
            const newSet = new Set(prev);
            if (newSet.has(cargoNumber)) {
                newSet.delete(cargoNumber);
            } else {
                newSet.add(cargoNumber);
            }
            return newSet;
        });
    }, []);

    const isFavorite = useCallback((cargoNumber: string | undefined): boolean => {
        return cargoNumber ? favorites.has(cargoNumber) : false;
    }, [favorites]);

    const { apiDateRange, prevRange } = useCargoDateRange({
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedMonthForFilter,
        selectedYearForFilter,
        selectedWeekForFilter,
    });

    const {
        primaryAuth,
        items,
        error,
        loading,
        mutatePerevozki,
        prevPeriodItems,
        prevPeriodLoading,
    } = useCargoDataLoad({
        auths,
        apiDateRange,
        prevRange,
        useServiceRequest,
        roleCustomer,
        roleSender,
        roleReceiver,
        onCustomerDetected,
    });

    useEffect(() => {
        if (!useServiceRequest || !primaryAuth?.login || !primaryAuth?.password) return;
        const inns = [...new Set(items.map((i) => {
            const inn = (i?.INN ?? i?.Inn ?? i?.inn ?? "").toString().trim();
            return inn.length > 0 ? inn : null;
        }).filter((x): x is string => !!x))];
        if (inns.length === 0) return;
        let cancelled = false;
        fetch('/api/customer-work-schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: primaryAuth.login, password: primaryAuth.password, inns }),
        })
            .then((r) => r.json())
            .then((data: { items?: { inn: string; days_of_week: number[]; work_start: string; work_end: string }[] }) => {
                if (cancelled) return;
                const ws: Record<string, WorkSchedule> = {};
                (data?.items ?? []).forEach((r) => {
                    if (r?.inn) ws[r.inn.trim()] = { days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5], work_start: r.work_start || '09:00', work_end: r.work_end || '18:00' };
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => { /* ignore */ });
        return () => { cancelled = true; };
    }, [useServiceRequest, primaryAuth?.login, primaryAuth?.password, items]);

    useEffect(() => {
        if (!contextCargoNumber) return;
        const norm = (s: string) => String(s).replace(/^0+/, '') || s;
        const ctxNorm = norm(contextCargoNumber);
        const match = items.find(item => norm(String(item.Number ?? '')) === ctxNorm);
        if (match) {
            setSelectedCargo(match);
            contextCargoWidenedRef.current = false;
            onClearContextCargo?.();
            return;
        }
        if (!loading) {
            if (!contextCargoWidenedRef.current) {
                contextCargoWidenedRef.current = true;
                setDateFilter('год');
                setSelectedYearForFilter(new Date().getFullYear());
            } else {
                contextCargoWidenedRef.current = false;
                onClearContextCargo?.();
            }
        }
    }, [contextCargoNumber, items, loading, onClearContextCargo]);

    const uniqueSenders = useMemo(() => [...new Set(items.map(i => (i.Sender ?? '').trim()).filter(Boolean))].sort(), [items]);
    const uniqueReceivers = useMemo(() => [...new Set(items.map(i => (i.Receiver ?? (i as any).receiver ?? '').trim()).filter(Boolean))].sort(), [items]);

    // Client-side filtering and sorting
    const filteredItems = useMemo(() => {
        return buildFilteredCargoItems({
            items,
            searchText,
            statusFilterSet,
            senderFilter,
            receiverFilter,
            useServiceRequest,
            billStatusFilterSet,
            typeFilterSet,
            routeFilterSet,
            sortBy,
            sortOrder,
        });
    }, [items, searchText, statusFilterSet, senderFilter, receiverFilter, billStatusFilterSet, useServiceRequest, typeFilterSet, routeFilterSet, sortBy, sortOrder]);

    const summary = useMemo(() => buildCargoSummary(filteredItems), [filteredItems]);

    const groupedByCustomer = useMemo(() => buildGroupedByCustomer(filteredItems), [filteredItems]);

    const sortedGroupedByCustomer = useMemo(() => {
        return sortGroupedByCustomer(groupedByCustomer, tableSortColumn, tableSortOrder, stripOoo);
    }, [groupedByCustomer, tableSortColumn, tableSortOrder]);

    const handleTableSort = (column: typeof tableSortColumn) => {
        if (tableSortColumn === column) {
            setTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setTableSortColumn(column);
            setTableSortOrder('asc');
        }
    };

    const handleInnerTableSort = (column: InnerTableSortCol) => {
        if (innerTableSortColumn === column) {
            setInnerTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setInnerTableSortColumn(column);
            setInnerTableSortOrder('asc');
        }
    };

    const sortInnerItems = (items: CargoItem[]): CargoItem[] => {
        if (!innerTableSortColumn) return items;
        const col = innerTableSortColumn;
        const order = innerTableSortOrder === 'asc' ? 1 : -1;
        return [...items].sort((a, b) => {
            let va: string | number, vb: string | number;
            switch (col) {
                case 'number': va = (a.Number || '').toString(); vb = (b.Number || '').toString(); break;
                case 'datePrih': va = (a.DatePrih || '').toString(); vb = (b.DatePrih || '').toString(); break;
                case 'status': va = normalizeStatus(a.State) || ''; vb = normalizeStatus(b.State) || ''; break;
                case 'mest': va = typeof a.Mest === 'string' ? parseFloat(a.Mest) || 0 : (a.Mest ?? 0); vb = typeof b.Mest === 'string' ? parseFloat(b.Mest) || 0 : (b.Mest ?? 0); break;
                case 'pw': va = typeof a.PW === 'string' ? parseFloat(a.PW) || 0 : (a.PW ?? 0); vb = typeof b.PW === 'string' ? parseFloat(b.PW) || 0 : (b.PW ?? 0); break;
                case 'sum': va = typeof a.Sum === 'string' ? parseFloat(a.Sum) || 0 : (a.Sum ?? 0); vb = typeof b.Sum === 'string' ? parseFloat(b.Sum) || 0 : (b.Sum ?? 0); break;
                default: return 0;
            }
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return order * cmp;
        });
    };

    const handleShareCargo = useCallback(async (item: CargoItem) => {
        if (!item.Number || !primaryAuth) return;
        const baseOrigin = typeof window !== "undefined" ? window.location.origin : "";
        const docTypesList = item._role === 'Customer'
            ? [{ label: "ЭР" as const, metod: DOCUMENT_METHODS["ЭР"] }, { label: "СЧЕТ" as const, metod: DOCUMENT_METHODS["СЧЕТ"] }, { label: "УПД" as const, metod: DOCUMENT_METHODS["УПД"] }, { label: "АПП" as const, metod: DOCUMENT_METHODS["АПП"] }]
            : [{ label: "АПП" as const, metod: DOCUMENT_METHODS["АПП"] }];
        const longUrls: Record<string, string> = {};
        for (const { label, metod } of docTypesList) {
            const params = new URLSearchParams({
                login: primaryAuth.login,
                password: primaryAuth.password,
                metod,
                number: item.Number,
                ...(primaryAuth.isRegisteredUser ? { isRegisteredUser: "true" } : {}),
            });
            longUrls[label] = `${baseOrigin}${PROXY_API_DOWNLOAD_URL}?${params.toString()}`;
        }
        const shortUrls: Record<string, string> = {};
        const shortenPromises = docTypesList.map(async ({ label, metod }) => {
            try {
                const res = await fetch('/api/shorten-doc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        login: primaryAuth.login,
                        password: primaryAuth.password,
                        metod,
                        number: item.Number,
                        ...(primaryAuth.isRegisteredUser ? { isRegisteredUser: true } : {}),
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    shortUrls[label] = data.shortUrl || data.short_url;
                } else {
                    shortUrls[label] = longUrls[label];
                }
            } catch {
                shortUrls[label] = longUrls[label];
            }
        });
        await Promise.all(shortenPromises);
        const lines: string[] = [];
        lines.push(`Перевозка: ${item.Number}`);
        if (item.State) lines.push(`Статус: ${normalizeStatus(item.State)}`);
        if (item.DatePrih) lines.push(`Приход: ${formatDate(item.DatePrih)}`);
        lines.push(`Доставка: ${getFilterKeyByStatus(item.State) === 'delivered' && item.DateVr ? formatDate(item.DateVr) : '-'}`);
        if (item.Sender) lines.push(`Отправитель: ${stripOoo(item.Sender)}`);
        if (item.Customer) lines.push(`Заказчик: ${stripOoo(item.Customer)}`);
        lines.push(`Тип перевозки: ${item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1 ? 'Паром' : 'Авто'}`);
        const fromCity = cityToCode(item.CitySender);
        const toCity = cityToCode(item.CityReceiver);
        lines.push(`Место отправления: ${fromCity || '-'}`);
        lines.push(`Место получения: ${toCity || '-'}`);
        if (item.Mest !== undefined) lines.push(`Мест: ${item.Mest}`);
        if (item._role === 'Customer') {
            if (item.PW !== undefined) lines.push(`Плат. вес: ${item.PW} кг`);
            if (item.Sum !== undefined) lines.push(`Стоимость: ${formatCurrency(item.Sum as any)}`);
            if (item.StateBill) lines.push(`Статус счета: ${item.StateBill}`);
        }
        if (item.W !== undefined) lines.push(`Вес: ${item.W} кг`);
        if (item.Value !== undefined) lines.push(`Объем: ${item.Value} м³`);
        Object.entries(item).forEach(([k, v]) => {
            if (["Number", "State", "DatePrih", "DateVr", "Sender", "Customer", "Mest", "PW", "W", "Value", "Sum", "StateBill", "_role"].includes(k)) return;
            if (k === "AutoReg" && !useServiceRequest) return;
            if (v === undefined || v === null || v === "" || (typeof v === "string" && v.trim() === "")) return;
            const label = k === "AutoReg" ? "Транспортное средство" : k;
            lines.push(`${label}: ${String(v)}`);
        });
        lines.push("");
        lines.push("Документы:");
        if (item._role === 'Customer') {
            lines.push(`ЭР: ${shortUrls["ЭР"] || "(не удалось сократить)"}`);
            lines.push(`Счет: ${shortUrls["СЧЕТ"] || "(не удалось сократить)"}`);
            lines.push(`УПД: ${shortUrls["УПД"] || "(не удалось сократить)"}`);
        }
        lines.push(`АПП: ${shortUrls["АПП"] || "(не удалось сократить)"}`);
        const text = lines.join("\n");
        try {
            if (typeof navigator !== "undefined" && (navigator as any).share) {
                await (navigator as any).share({ title: `HAULZ — перевозка ${item.Number}`, text });
                return;
            }
        } catch { /* ignore */ }
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                alert("Скопировано");
                return;
            }
        } catch { /* ignore */ }
        alert(text);
    }, [primaryAuth, useServiceRequest]);

    return (
        <div className="w-full">
            <div className="cargo-page-sticky-header">
            <Flex align="center" justify="space-between" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Грузы</Typography.Headline>
                <Flex align="center" gap="0.5rem" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <Typography.Body style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Таблица</Typography.Body>
                    <button
                        type="button"
                        className="roles-switch-wrap"
                        onClick={(e: React.MouseEvent) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setTableModeByCustomer(v => !v);
                        }}
                        style={{ cursor: 'pointer', border: 'none', background: 'transparent', padding: 2 }}
                        aria-label={tableModeByCustomer ? 'Показать карточки' : 'Показать таблицу'}
                    >
                        <TapSwitch checked={tableModeByCustomer} onToggle={() => setTableModeByCustomer(v => !v)} />
                    </button>
                </Flex>
            </Flex>
            <div className="filters-container filters-row-scroll">
                <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                    <Button
                        className="filter-button"
                        style={{ padding: '0.5rem', minWidth: 'auto' }}
                        onClick={() => {
                            if (!sortBy) {
                                setSortBy('datePrih');
                                setSortOrder('desc');
                            } else if (sortBy === 'datePrih' && sortOrder === 'desc') {
                                setSortOrder('asc');
                            } else if (sortBy === 'datePrih' && sortOrder === 'asc') {
                                setSortBy('dateVr');
                                setSortOrder('desc');
                            } else if (sortBy === 'dateVr' && sortOrder === 'desc') {
                                setSortOrder('asc');
                            } else if (sortBy === 'dateVr' && sortOrder === 'asc') {
                                setSortBy(null);
                                setSortOrder('desc');
                            }
                        }}
                        title={
                            !sortBy ? "Сортировать по дате прихода" :
                            sortBy === 'datePrih' && sortOrder === 'desc' ? "Сортировать по дате прихода (возрастание)" :
                            sortBy === 'datePrih' && sortOrder === 'asc' ? "Сортировать по дате доставки" :
                            sortBy === 'dateVr' && sortOrder === 'desc' ? "Сортировать по дате доставки (возрастание)" :
                            "Сбросить сортировку"
                        }
                    >
                        {!sortBy ? (
                            <ArrowUpDown className="w-4 h-4" style={{ opacity: 0.5 }} />
                        ) : sortOrder === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                        ) : (
                            <ArrowDown className="w-4 h-4" />
                        )}
                    </Button>
                    <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Дата: {dateFilter === 'период' ? 'Период' : dateFilter === 'месяц' && selectedMonthForFilter ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}` : dateFilter === 'год' && selectedYearForFilter ? `${selectedYearForFilter}` : dateFilter === 'неделя' && selectedWeekForFilter ? (() => { const r = getWeekRange(selectedWeekForFilter); return `${r.dateFrom.slice(8,10)}.${r.dateFrom.slice(5,7)} – ${r.dateTo.slice(8,10)}.${r.dateTo.slice(5,7)}`; })() : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={dateButtonRef} isOpen={isDateDropdownOpen} onClose={() => setIsDateDropdownOpen(false)}>
                        {dateDropdownMode === 'months' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {MONTH_NAMES.map((name, i) => (
                                    <div key={i} className="dropdown-item" onClick={() => {
                                        const year = new Date().getFullYear();
                                        setDateFilter('месяц');
                                        setSelectedMonthForFilter({ year, month: i + 1 });
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{name} {new Date().getFullYear()}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : dateDropdownMode === 'years' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {getYearsList(6).map(y => (
                                    <div key={y} className="dropdown-item" onClick={() => {
                                        setDateFilter('год');
                                        setSelectedYearForFilter(y);
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{y}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : dateDropdownMode === 'weeks' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {getWeeksList(16).map(w => (
                                    <div key={w.monday} className="dropdown-item" onClick={() => {
                                        setDateFilter('неделя');
                                        setSelectedWeekForFilter(w.monday);
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
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
                                            setDateFilter(key as any);
                                            if (key === 'месяц') setSelectedMonthForFilter(null);
                                            if (key === 'год') setSelectedYearForFilter(null);
                                            if (key === 'неделя') setSelectedWeekForFilter(null);
                                            setIsDateDropdownOpen(false);
                                            if (key === 'период') setIsCustomModalOpen(true);
                                        }}
                                    >
                                        <Typography.Body>{key === 'год' ? 'Год' : key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                    </div>
                                );
                            })
                        )}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Статус: {statusFilterSet.size === 0 ? 'Все' : statusFilterSet.size === 1 ? STATUS_MAP[[...statusFilterSet][0]] : `Выбрано: ${statusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={statusButtonRef} isOpen={isStatusDropdownOpen} onClose={() => setIsStatusDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setStatusFilterSet(new Set()); setIsStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {CARGO_STATUS_FILTER_KEYS.map(key => (
                            <div key={key} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setStatusFilterSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} style={{ background: statusFilterSet.has(key) ? 'var(--color-bg-hover)' : undefined }}>
                                <Typography.Body>{STATUS_MAP[key]} {statusFilterSet.has(key) ? '✓' : ''}</Typography.Body>
                            </div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={senderButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsSenderDropdownOpen(!isSenderDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Отправитель: {senderFilter ? stripOoo(senderFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={senderButtonRef} isOpen={isSenderDropdownOpen} onClose={() => setIsSenderDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setSenderFilter(''); setIsSenderDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueSenders.map(s => (
                            <div key={s} className="dropdown-item" onClick={() => { setSenderFilter(s); setIsSenderDropdownOpen(false); }}><Typography.Body>{stripOoo(s)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={receiverButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsReceiverDropdownOpen(!isReceiverDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Получатель: {receiverFilter ? stripOoo(receiverFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={receiverButtonRef} isOpen={isReceiverDropdownOpen} onClose={() => setIsReceiverDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setReceiverFilter(''); setIsReceiverDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueReceivers.map(r => (
                            <div key={r} className="dropdown-item" onClick={() => { setReceiverFilter(r); setIsReceiverDropdownOpen(false); }}><Typography.Body>{stripOoo(r)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                {useServiceRequest && (
                    <div className="filter-group" style={{ flexShrink: 0 }}>
                        <div ref={billStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsBillStatusDropdownOpen(!isBillStatusDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                Статус счёта: {billStatusFilterSet.size === 0 ? 'Все' : billStatusFilterSet.size === 1 ? BILL_STATUS_MAP[[...billStatusFilterSet][0]] : `Выбрано: ${billStatusFilterSet.size}`} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={billStatusButtonRef} isOpen={isBillStatusDropdownOpen} onClose={() => setIsBillStatusDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setBillStatusFilterSet(new Set()); setIsBillStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {(['paid', 'unpaid', 'partial', 'cancelled', 'unknown'] as const).map(key => (
                                <div key={key} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setBillStatusFilterSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} style={{ background: billStatusFilterSet.has(key) ? 'var(--color-bg-hover)' : undefined }}>
                                    <Typography.Body>{BILL_STATUS_MAP[key]} {billStatusFilterSet.has(key) ? '✓' : ''}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                    </div>
                )}
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={typeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Тип: {typeFilterSet.size === 0 ? 'Все' : typeFilterSet.size === 2 ? 'Паром, Авто' : typeFilterSet.has('ferry') ? 'Паром' : 'Авто'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={typeButtonRef} isOpen={isTypeDropdownOpen} onClose={() => setIsTypeDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setTypeFilterSet(new Set()); setIsTypeDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setTypeFilterSet(prev => { const next = new Set(prev); if (next.has('ferry')) next.delete('ferry'); else next.add('ferry'); return next; }); }} style={{ background: typeFilterSet.has('ferry') ? 'var(--color-bg-hover)' : undefined }}><Typography.Body>Паром {typeFilterSet.has('ferry') ? '✓' : ''}</Typography.Body></div>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setTypeFilterSet(prev => { const next = new Set(prev); if (next.has('auto')) next.delete('auto'); else next.add('auto'); return next; }); }} style={{ background: typeFilterSet.has('auto') ? 'var(--color-bg-hover)' : undefined }}><Typography.Body>Авто {typeFilterSet.has('auto') ? '✓' : ''}</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={routeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsRouteDropdownOpen(!isRouteDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); }}>
                            Маршрут: {routeFilterSet.size === 0 ? 'Все' : routeFilterSet.size === 2 ? 'Выбрано: 2' : [...routeFilterSet][0] === 'MSK-KGD' ? 'MSK – KGD' : 'KGD – MSK'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={routeButtonRef} isOpen={isRouteDropdownOpen} onClose={() => setIsRouteDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setRouteFilterSet(new Set()); setIsRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setRouteFilterSet(prev => { const next = new Set(prev); if (next.has('MSK-KGD')) next.delete('MSK-KGD'); else next.add('MSK-KGD'); return next; }); }} style={{ background: routeFilterSet.has('MSK-KGD') ? 'var(--color-bg-hover)' : undefined }}><Typography.Body>MSK – KGD {routeFilterSet.has('MSK-KGD') ? '✓' : ''}</Typography.Body></div>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setRouteFilterSet(prev => { const next = new Set(prev); if (next.has('KGD-MSK')) next.delete('KGD-MSK'); else next.add('KGD-MSK'); return next; }); }} style={{ background: routeFilterSet.has('KGD-MSK') ? 'var(--color-bg-hover)' : undefined }}><Typography.Body>KGD – MSK {routeFilterSet.has('KGD-MSK') ? '✓' : ''}</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
            </div>

            <CargoSummaryCard summary={summary} showSums={showSums} useServiceRequest={useServiceRequest} />
            </div>

            <CargoStateBlocks
                loading={loading}
                error={error}
                hasItems={filteredItems.length > 0}
                onRetry={() => mutatePerevozki(undefined, { revalidate: true })}
                onSetDateFilter={setDateFilter}
            />

            {!loading && !error && tableModeByCustomer && groupedByCustomer.length > 0 && (
                <CargoCustomerTable
                    showSums={showSums}
                    tableSortColumn={tableSortColumn}
                    tableSortOrder={tableSortOrder}
                    sortedGroupedByCustomer={sortedGroupedByCustomer}
                    expandedTableCustomer={expandedTableCustomer}
                    innerTableSortColumn={innerTableSortColumn}
                    innerTableSortOrder={innerTableSortOrder}
                    workScheduleByInn={workScheduleByInn}
                    onTableSort={handleTableSort}
                    onInnerTableSort={handleInnerTableSort}
                    sortInnerItems={sortInnerItems}
                    onToggleExpandedCustomer={(customer) => setExpandedTableCustomer(prev => prev === customer ? null : customer)}
                    onSelectCargo={setSelectedCargo}
                />
            )}

            {filteredItems.length > 0 && !tableModeByCustomer && (
                <CargoCardsList
                    filteredItems={filteredItems}
                    workScheduleByInn={workScheduleByInn}
                    useServiceRequest={useServiceRequest}
                    showSums={showSums}
                    isFavorite={isFavorite}
                    onToggleFavorite={toggleFavorite}
                    onShare={handleShareCargo}
                    onSelectCargo={setSelectedCargo}
                />
            )}

            {selectedCargo && primaryAuth && (
                <CargoDetailsModal
                    item={selectedCargo}
                    isOpen={!!selectedCargo}
                    onClose={() => setSelectedCargo(null)}
                    auth={primaryAuth}
                    onOpenChat={onOpenChat}
                    isFavorite={isFavorite}
                    onToggleFavorite={toggleFavorite}
                    showSums={showSums}
                    useServiceRequest={useServiceRequest}
                />
            )}
            <FilterDialog isOpen={isCustomModalOpen} onClose={() => setIsCustomModalOpen(false)} dateFrom={customDateFrom} dateTo={customDateTo} onApply={(f, t) => { setCustomDateFrom(f); setCustomDateTo(t); }} />
        </div>
    );
}
