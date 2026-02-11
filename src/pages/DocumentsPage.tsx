import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Calendar, ChevronDown, ArrowUp, ArrowDown, Share2, MessageCircle, Heart, Ship, AlertTriangle, Loader2 } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { CustomPeriodModal } from "../components/modals/CustomPeriodModal";
import { InvoiceDetailModal } from "../components/modals/InvoiceDetailModal";
import { DateText } from "../components/ui/DateText";
import { formatCurrency, stripOoo, formatInvoiceNumber, normalizeInvoiceStatus, cityToCode, parseCargoNumbersFromText } from "../lib/formatUtils";
import { normalizeStatus, getFilterKeyByStatus, getStatusClass, STATUS_MAP } from "../lib/statusUtils";
import {
    loadDateFilterState,
    saveDateFilterState,
    getDateRange,
    getWeekRange,
    getYearsList,
    getWeeksList,
    MONTH_NAMES,
    DEFAULT_DATE_FROM,
    DEFAULT_DATE_TO,
    getPayTillDate,
getPayTillDateColor,
} from "../lib/dateUtils";
import { useInvoices, usePerevozki } from "../hooks/useApi";
import type { AuthData, DateFilter, StatusFilter } from "../types";

const INVOICE_FAVORITES_VALUE = '__favorites__';
const INVOICE_STATUS_OPTIONS = ['Оплачен', 'Не оплачен', 'Оплачен частично'] as const;

type DocumentsPageProps = {
    auth: AuthData;
    useServiceRequest?: boolean;
    activeInn?: string;
    /** При клике на перевозку в документах — переход на вкладку «Грузы» и открытие карточки */
    onOpenCargo?: (cargoNumber: string) => void;
    onOpenChat?: (context?: string) => void | Promise<void>;
};

export function DocumentsPage({ auth, useServiceRequest = false, activeInn = '', onOpenCargo, onOpenChat }: DocumentsPageProps) {
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
    const [statusFilterSet, setStatusFilterSet] = useState<Set<string>>(() => new Set());
    const [typeFilter, setTypeFilter] = useState<'all' | 'ferry' | 'auto'>('all');
    const [routeFilter, setRouteFilter] = useState<'all' | 'MSK-KGD' | 'KGD-MSK'>('all');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
    const [sortBy, setSortBy] = useState<'date' | null>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [tableModeByCustomer, setTableModeByCustomer] = useState(false);
    const [expandedTableCustomer, setExpandedTableCustomer] = useState<string | null>(null);
    const [tableSortColumn, setTableSortColumn] = useState<'customer' | 'sum' | 'count'>('customer');
    const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
    const [innerTableSortColumn, setInnerTableSortColumn] = useState<'number' | 'date' | 'status' | 'sum' | 'deliveryStatus' | 'route'>('date');
    const [innerTableSortOrder, setInnerTableSortOrder] = useState<'asc' | 'desc'>('desc');
    const [deliveryStatusFilterSet, setDeliveryStatusFilterSet] = useState<Set<StatusFilter>>(() => new Set());
    const [routeFilterCargo, setRouteFilterCargo] = useState<string>('all');
    const [isDeliveryStatusDropdownOpen, setIsDeliveryStatusDropdownOpen] = useState(false);
    const [isRouteCargoDropdownOpen, setIsRouteCargoDropdownOpen] = useState(false);
    const [favVersion, setFavVersion] = useState(0);
    const deliveryStatusButtonRef = useRef<HTMLDivElement | null>(null);
    const routeCargoButtonRef = useRef<HTMLDivElement | null>(null);
    const dateButtonRef = useRef<HTMLDivElement | null>(null);
    const customerButtonRef = useRef<HTMLDivElement | null>(null);
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

    const apiDateRange = useMemo(() => {
        if (dateFilter === "период") return { dateFrom: customDateFrom, dateTo: customDateTo };
        if (dateFilter === "месяц" && selectedMonthForFilter) {
            const { year, month } = selectedMonthForFilter;
            const pad = (n: number) => String(n).padStart(2, '0');
            const lastDay = new Date(year, month, 0).getDate();
            return { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
        }
        if (dateFilter === "год" && selectedYearForFilter) {
            const y = selectedYearForFilter;
            return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
        }
        if (dateFilter === "неделя" && selectedWeekForFilter) {
            return getWeekRange(selectedWeekForFilter);
        }
        return getDateRange(dateFilter);
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);

    const { items, error, loading, mutate: mutateInvoices } = useInvoices({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        activeInn: activeInn || undefined,
        useServiceRequest,
    });

    const { items: perevozkiItems, loading: perevozkiLoading, mutate: mutatePerevozki } = usePerevozki({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        useServiceRequest: !!useServiceRequest,
    });

    useEffect(() => {
        if (!useServiceRequest) return;
        const handler = () => {
            void mutateInvoices(undefined, { revalidate: true });
            void mutatePerevozki(undefined, { revalidate: true });
        };
        window.addEventListener('haulz-service-refresh', handler);
        return () => window.removeEventListener('haulz-service-refresh', handler);
    }, [useServiceRequest, mutateInvoices, mutatePerevozki]);

    /** Канонический ключ для сопоставления номера перевозки (с/без ведущих нулей) */
    const normCargoKey = useCallback((num: string | null | undefined): string => {
        if (num == null) return '';
        const s = String(num).replace(/^0000-/, '').trim().replace(/^0+/, '') || '0';
        return s;
    }, []);

    /** Номер первой перевозки в счёте (из первой строки номенклатуры) */
    const getFirstCargoNumberFromInvoice = useCallback((inv: any): string | null => {
        const list: Array<{ Name?: string; Operation?: string }> = Array.isArray(inv?.List) ? inv.List : [];
        for (let i = 0; i < list.length; i++) {
            const text = String(list[i]?.Operation ?? list[i]?.Name ?? "").trim();
            if (!text) continue;
            const parts = parseCargoNumbersFromText(text);
            const cargo = parts.find((p) => p.type === "cargo");
            if (cargo?.value) return cargo.value;
        }
        return null;
    }, []);

    const cargoStateByNumber = useMemo(() => {
        const m = new Map<string, string>();
        (perevozkiItems || []).forEach((c: any) => {
            const raw = (c.Number ?? c.number ?? "").toString().replace(/^0000-/, "").trim();
            if (!raw || c.State == null) return;
            const key = raw.replace(/^0+/, '') || raw;
            m.set(key, String(c.State));
            if (key !== raw) m.set(raw, String(c.State));
        });
        return m;
    }, [perevozkiItems]);

    const cargoRouteByNumber = useMemo(() => {
        const m = new Map<string, string>();
        (perevozkiItems || []).forEach((c: any) => {
            const raw = (c.Number ?? c.number ?? "").toString().replace(/^0000-/, "").trim();
            if (!raw) return;
            const key = raw.replace(/^0+/, '') || raw;
            const from = cityToCode(c.CitySender ?? c.citySender);
            const to = cityToCode(c.CityReceiver ?? c.cityReceiver);
            const route = [from, to].filter(Boolean).join(' – ') || '';
            if (route) {
                m.set(key, route);
                if (key !== raw) m.set(raw, route);
            }
        });
        return m;
    }, [perevozkiItems]);

    const uniqueCustomers = useMemo(() => [...new Set(items.map(i => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim())).filter(Boolean))].sort(), [items]);

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
        let res = [...items];
        if (customerFilter) res = res.filter(i => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim()) === customerFilter);
        if (statusFilterSet.size > 0) {
            res = res.filter((i) => {
                const invStatus = normalizeInvoiceStatus(i.Status ?? i.State ?? i.state ?? i.Статус ?? i.status ?? i.PaymentStatus ?? '');
                const invNum = String(i.Number ?? i.number ?? i.Номер ?? i.N ?? '');
                const isFav = isInvoiceFavorite(invNum);
                return (statusFilterSet.has(INVOICE_FAVORITES_VALUE) && isFav) || statusFilterSet.has(invStatus);
            });
        }
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        if (deliveryStatusFilterSet.size > 0) {
            res = res.filter((i) => {
                const cargoNum = getFirstCargoNumberFromInvoice(i);
                const state = cargoNum ? cargoStateByNumber.get(normCargoKey(cargoNum)) : undefined;
                return deliveryStatusFilterSet.has(getFilterKeyByStatus(state));
            });
        }
        if (routeFilterCargo !== 'all') {
            res = res.filter((i) => {
                const cargoNum = getFirstCargoNumberFromInvoice(i);
                const route = cargoNum ? cargoRouteByNumber.get(normCargoKey(cargoNum)) : '';
                return route === routeFilterCargo;
            });
        }
        const getDate = (r: any) => (r.Date ?? r.date ?? r.Дата ?? r.DateDoc ?? '').toString();
        if (sortBy === 'date') {
            res.sort((a, b) => {
                const da = getDate(a);
                const db = getDate(b);
                const cmp = da.localeCompare(db);
                return sortOrder === 'desc' ? -cmp : cmp;
            });
        }
        return res;
    }, [items, customerFilter, statusFilterSet, typeFilter, routeFilter, sortBy, sortOrder, favVersion, isInvoiceFavorite, deliveryStatusFilterSet, routeFilterCargo, getFirstCargoNumberFromInvoice, cargoStateByNumber, cargoRouteByNumber, normCargoKey]);

    const documentsSummary = useMemo(() => {
        let sum = 0;
        filteredItems.forEach(i => {
            const v = i.SumDoc ?? i.Sum ?? i.sum ?? i.Сумма ?? i.Amount ?? 0;
            sum += typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
        });
        return { sum, count: filteredItems.length };
    }, [filteredItems]);

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

    const handleTableSort = (column: 'customer' | 'sum' | 'count') => {
        if (tableSortColumn === column) setTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setTableSortColumn(column); setTableSortOrder('asc'); }
    };

    const handleInnerTableSort = (column: 'number' | 'date' | 'status' | 'sum' | 'deliveryStatus' | 'route') => {
        if (innerTableSortColumn === column) setInnerTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        else { setInnerTableSortColumn(column); setInnerTableSortOrder(column === 'date' ? 'desc' : 'asc'); }
    };

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

    return (
        <div className="w-full">
            <div className="cargo-page-sticky-header">
                <Flex align="center" justify="space-between" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Документы</Typography.Headline>
                    <Flex align="center" gap="0.5rem" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <Typography.Body style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Таблица</Typography.Body>
                        <span className="roles-switch-wrap">
                            <TapSwitch checked={tableModeByCustomer} onToggle={() => setTableModeByCustomer(v => !v)} />
                        </span>
                    </Flex>
                </Flex>
                <div className="filters-container filters-row-scroll">
                    <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                        <Button className="filter-button" style={{ padding: '0.5rem', minWidth: 'auto' }} onClick={() => { setSortBy('date'); setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); }} title={sortOrder === 'desc' ? 'Дата по убыванию' : 'Дата по возрастанию'}>
                            {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                        </Button>
                        <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); }}>
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
                        {useServiceRequest && (
                            <>
                                <div ref={customerButtonRef} style={{ display: 'inline-flex' }}>
                                    <Button className="filter-button" onClick={() => { setIsCustomerDropdownOpen(!isCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); }}>
                                        Заказчик: {customerFilter ? stripOoo(customerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={customerButtonRef} isOpen={isCustomerDropdownOpen} onClose={() => setIsCustomerDropdownOpen(false)}>
                                    <div className="dropdown-item" onClick={() => { setCustomerFilter(''); setIsCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueCustomers.map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setCustomerFilter(c); setIsCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); setIsRouteCargoDropdownOpen(false); }}>
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
                            <Button className="filter-button" onClick={() => { setIsDeliveryStatusDropdownOpen(!isDeliveryStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsRouteCargoDropdownOpen(false); }}>
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
                            <Button className="filter-button" onClick={() => { setIsRouteCargoDropdownOpen(!isRouteCargoDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsDeliveryStatusDropdownOpen(false); }}>
                                Маршрут: {routeFilterCargo === 'all' ? 'Все' : routeFilterCargo} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={routeCargoButtonRef} isOpen={isRouteCargoDropdownOpen} onClose={() => setIsRouteCargoDropdownOpen(false)}>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('all'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('MSK – KGD'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>MSK – KGD</Typography.Body></div>
                            <div className="dropdown-item" onClick={() => { setRouteFilterCargo('KGD – MSK'); setIsRouteCargoDropdownOpen(false); }}><Typography.Body>KGD – MSK</Typography.Body></div>
                        </FilterDropdownPortal>
                        <CustomPeriodModal
                            isOpen={isCustomModalOpen}
                            onClose={() => setIsCustomModalOpen(false)}
                            dateFrom={customDateFrom}
                            dateTo={customDateTo}
                            onApply={(f, t) => { setCustomDateFrom(f); setCustomDateTo(t); setDateFilter('период'); }}
                        />
                    </div>
                </div>
            </div>
            <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>Счета</Typography.Body>
            {!loading && !error && filteredItems.length > 0 && (
                <div className="cargo-card mb-4" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
                    <div className="summary-metrics">
                        <Flex direction="column" align="center">
                            <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Сумма</Typography.Label>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatCurrency(documentsSummary.sum)}</Typography.Body>
                        </Flex>
                        <Flex direction="column" align="center">
                            <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Счетов</Typography.Label>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>{documentsSummary.count}</Typography.Body>
                        </Flex>
                    </div>
                </div>
            )}
            {loading && (
                <Flex justify="center" className="py-8">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                </Flex>
            )}
            {error && (
                <Flex align="center" className="mt-4" style={{ color: 'var(--color-error)' }}>
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <Typography.Body>{error}</Typography.Body>
                </Flex>
            )}
            {!loading && !error && tableModeByCustomer && sortedGroupedByCustomer.length > 0 && (
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('customer')} title="Сортировка">Заказчик {tableSortColumn === 'customer' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('sum')} title="Сортировка">Сумма {tableSortColumn === 'sum' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleTableSort('count')} title="Сортировка">Счетов {tableSortColumn === 'count' && (tableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedGroupedByCustomer.map((row, i) => (
                                <React.Fragment key={i}>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedTableCustomer === row.customer ? 'var(--color-bg-hover)' : undefined }} onClick={() => setExpandedTableCustomer(prev => prev === row.customer ? null : row.customer)} title={expandedTableCustomer === row.customer ? 'Свернуть' : 'Показать счета'}>
                                        <td style={{ padding: '0.5rem 0.4rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo(row.customer)}>{stripOoo(row.customer)}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum)}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.items.length}</td>
                                    </tr>
                                    {expandedTableCustomer === row.customer && (
                                        <tr key={`${i}-detail`}>
                                            <td colSpan={3} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                    <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('number'); }} title="Сортировка">Номер {innerTableSortColumn === 'number' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} className="doc-inner-table-date" onClick={(e) => { e.stopPropagation(); handleInnerTableSort('date'); }} title="Сортировка">Дата {innerTableSortColumn === 'date' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('status'); }} title="Сортировка">Статус {innerTableSortColumn === 'status' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('deliveryStatus'); }} title="Сортировка">Статус перевозки {innerTableSortColumn === 'deliveryStatus' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} className="doc-inner-table-route" onClick={(e) => { e.stopPropagation(); handleInnerTableSort('route'); }} title="Сортировка">Маршрут {innerTableSortColumn === 'route' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleInnerTableSort('sum'); }} title="Сортировка">Сумма {innerTableSortColumn === 'sum' && (innerTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sortInvoices(row.items).map((inv: any, j: number) => {
                                                                const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '';
                                                                const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '';
                                                                const isum = inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount ?? 0;
                                                                const ist = normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? inv.status ?? inv.PaymentStatus ?? '');
                                                                const firstCargoNum = getFirstCargoNumberFromInvoice(inv);
                                                                const deliveryState = firstCargoNum ? cargoStateByNumber.get(normCargoKey(firstCargoNum)) : undefined;
                                                                const deliveryStateNorm = normalizeStatus(deliveryState);
                                                                const deliveryStatusClass = getStatusClass(deliveryState);
                                                                return (
                                                                    <tr key={inum || j} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setSelectedInvoice(inv); }} title="Открыть счёт">
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{formatInvoiceNumber(inum)}</td>
                                                                        <td className="doc-inner-table-date" style={{ padding: '0.35rem 0.3rem' }}><DateText value={typeof idt === 'string' ? idt : idt ? String(idt) : undefined} /></td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{ist || '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>
                                                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <span className={deliveryStatusClass} style={{ fontSize: '0.7rem', padding: '0.15rem 0.35rem', borderRadius: '999px', fontWeight: 600 }}>{deliveryStateNorm || '—'}</span>}
                                                                        </td>
                                                                        <td className="doc-inner-table-route" style={{ padding: '0.35rem 0.3rem' }}>
                                                                            {perevozkiLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--color-primary-blue)', border: '1px solid rgba(59, 130, 246, 0.4)' }}>{(firstCargoNum ? cargoRouteByNumber.get(normCargoKey(firstCargoNum)) : null) || '—'}</span>}
                                                                        </td>
                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{isum != null ? formatCurrency(isum) : '—'}</td>
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
            {!loading && !error && filteredItems.length > 0 && !tableModeByCustomer && (
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
                                        <Button style={{ padding: '0.25rem', minWidth: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onOpenChat?.(`Счёт ${formatInvoiceNumber(num)}`); }} title="Чат"><MessageCircle className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} /></Button>
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
                                    {st && <span className="role-badge" style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: '999px', background: badgeStyle.bg, color: badgeStyle.color, border: '1px solid var(--color-border)' }}>{st}</span>}
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
        </div>
    );
}
