import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Calendar, ChevronDown, ArrowUp, ArrowDown, Share2, MessageCircle, Heart, Ship, AlertTriangle, Loader2 } from "lucide-react";
import { TapSwitch } from "../components/TapSwitch";
import { FilterDropdownPortal } from "../components/ui/FilterDropdownPortal";
import { CustomPeriodModal } from "../components/modals/CustomPeriodModal";
import { InvoiceDetailModal } from "../components/modals/InvoiceDetailModal";
import { DateText } from "../components/ui/DateText";
import { formatCurrency, stripOoo, formatInvoiceNumber, normalizeInvoiceStatus, cityToCode } from "../lib/formatUtils";
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
} from "../lib/dateUtils";
import { useInvoices } from "../hooks/useApi";
import type { AuthData, DateFilter } from "../types";

const INVOICE_STATUS_OPTIONS = ['Оплачен', 'Не оплачен', 'Оплачен частично'] as const;

type DocumentsPageProps = {
    auth: AuthData;
    useServiceRequest?: boolean;
    activeInn?: string;
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
    const [statusFilter, setStatusFilter] = useState<string>('');
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
    const [favVersion, setFavVersion] = useState(0);
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

    const { items, error, loading } = useInvoices({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        activeInn: activeInn || undefined,
        useServiceRequest,
    });

    const uniqueCustomers = useMemo(() => [...new Set(items.map(i => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim())).filter(Boolean))].sort(), [items]);

    const filteredItems = useMemo(() => {
        let res = [...items];
        if (customerFilter) res = res.filter(i => ((i.Customer ?? i.customer ?? i.Контрагент ?? i.Contractor ?? i.Organization ?? '').trim()) === customerFilter);
        if (statusFilter) res = res.filter(i => normalizeInvoiceStatus(i.Status ?? i.State ?? i.state ?? i.Статус ?? i.Status) === statusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
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
    }, [items, customerFilter, statusFilter, typeFilter, routeFilter, sortBy, sortOrder]);

    const documentsSummary = useMemo(() => {
        let sum = 0;
        filteredItems.forEach(i => {
            const v = i.SumDoc ?? i.Sum ?? i.sum ?? i.Сумма ?? i.Amount ?? 0;
            sum += typeof v === 'string' ? parseFloat(v) || 0 : (v || 0);
        });
        return { sum, count: filteredItems.length };
    }, [filteredItems]);

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

    return (
        <div className="w-full">
            <div className="cargo-page-sticky-header">
                <Flex align="center" justify="space-between" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Документы</Typography.Headline>
                    {useServiceRequest && (
                        <Flex align="center" gap="0.5rem" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <Typography.Body style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Таблица по заказчику</Typography.Body>
                            <span className="roles-switch-wrap">
                                <TapSwitch checked={tableModeByCustomer} onToggle={() => setTableModeByCustomer(v => !v)} />
                            </span>
                        </Flex>
                    )}
                </Flex>
                <div className="filters-container filters-row-scroll">
                    <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                        <Button className="filter-button" style={{ padding: '0.5rem', minWidth: 'auto' }} onClick={() => { setSortBy('date'); setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); }} title={sortOrder === 'desc' ? 'Дата по убыванию' : 'Дата по возрастанию'}>
                            {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                        </Button>
                        <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsCustomerDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                Дата: {dateFilter === 'период' ? 'Период' : dateFilter === 'месяц' && selectedMonthForFilter ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}` : dateFilter === 'год' && selectedYearForFilter ? `${selectedYearForFilter}` : dateFilter === 'неделя' && selectedWeekForFilter ? (() => { const r = getWeekRange(selectedWeekForFilter); return `${r.dateFrom.slice(8, 10)}.${r.dateFrom.slice(5, 7)} – ${r.dateTo.slice(8, 10)}.${r.dateTo.slice(5, 7)}`; })() : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={dateButtonRef} isOpen={isDateDropdownOpen}>
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
                                    <Button className="filter-button" onClick={() => { setIsCustomerDropdownOpen(!isCustomerDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                        Заказчик: {customerFilter ? stripOoo(customerFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                                    </Button>
                                </div>
                                <FilterDropdownPortal triggerRef={customerButtonRef} isOpen={isCustomerDropdownOpen}>
                                    <div className="dropdown-item" onClick={() => { setCustomerFilter(''); setIsCustomerDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                                    {uniqueCustomers.map(c => (
                                        <div key={c} className="dropdown-item" onClick={() => { setCustomerFilter(c); setIsCustomerDropdownOpen(false); }}><Typography.Body>{stripOoo(c)}</Typography.Body></div>
                                    ))}
                                </FilterDropdownPortal>
                            </>
                        )}
                        <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsCustomerDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                Статус счёта: {statusFilter ? statusFilter : 'Все'} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={statusButtonRef} isOpen={isStatusDropdownOpen}>
                            <div className="dropdown-item" onClick={() => { setStatusFilter(''); setIsStatusDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                            {INVOICE_STATUS_OPTIONS.map(s => (
                                <div key={s} className="dropdown-item" onClick={() => { setStatusFilter(s); setIsStatusDropdownOpen(false); }}><Typography.Body>{s}</Typography.Body></div>
                            ))}
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
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatCurrency(documentsSummary.sum, true)}</Typography.Body>
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
            {!loading && !error && useServiceRequest && tableModeByCustomer && sortedGroupedByCustomer.length > 0 && (
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
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum, true)}</td>
                                        <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.items.length}</td>
                                    </tr>
                                    {expandedTableCustomer === row.customer && (
                                        <tr key={`${i}-detail`}>
                                            <td colSpan={3} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Номер</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {row.items.map((inv: any, j: number) => {
                                                                const inum = inv.Number ?? inv.number ?? inv.Номер ?? inv.N ?? '';
                                                                const idt = inv.DateDoc ?? inv.Date ?? inv.date ?? inv.Дата ?? '';
                                                                const isum = inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount ?? 0;
                                                                const ist = normalizeInvoiceStatus(inv.Status ?? inv.State ?? inv.state ?? inv.Статус ?? '');
                                                                return (
                                                                    <tr key={inum || j} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); setSelectedInvoice(inv); }} title="Открыть счёт">
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{formatInvoiceNumber(inum)}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={typeof idt === 'string' ? idt : idt ? String(idt) : undefined} /></td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{ist || '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{isum != null ? formatCurrency(isum, true) : '—'}</td>
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
            {!loading && !error && filteredItems.length > 0 && !(useServiceRequest && tableModeByCustomer) && (
                <div className="cargo-list">
                    {filteredItems.map((row, idx) => {
                        const num = row.Number ?? row.number ?? row.Номер ?? row.N ?? '';
                        const dt = row.DateDoc ?? row.Date ?? row.date ?? row.Дата ?? '';
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
                                        {useServiceRequest && cust && (
                                            <span className="role-badge" style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.4rem', borderRadius: '999px', background: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>Заказчик</span>
                                        )}
                                    </Flex>
                                    <Flex align="center" gap="0.5rem" style={{ flexShrink: 0 }}>
                                        <Button style={{ padding: '0.25rem', minWidth: 'auto', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); const lines = [`Счёт: ${formatInvoiceNumber(num)}`, cust && `Заказчик: ${stripOoo(String(cust))}`, sum != null && `Сумма: ${formatCurrency(sum, true)}`, dt && `Дата: ${typeof dt === 'string' ? dt : String(dt)}`].filter(Boolean); const text = lines.join('\n'); if (typeof navigator !== 'undefined' && (navigator as any).share) { (navigator as any).share({ title: `Счёт ${formatInvoiceNumber(num)}`, text }).catch(() => {}); } else { try { navigator.clipboard?.writeText(text); } catch {} } }} title="Поделиться"><Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} /></Button>
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
                                    <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{sum != null ? formatCurrency(sum, true) : '—'}</Typography.Body>
                                </Flex>
                                <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    <Typography.Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={stripOoo(String(cust || ''))}>{stripOoo(String(cust || '—'))}</Typography.Label>
                                    {(row.AK === true || row.AK === 'true' || row.AK === '1' || row.AK === 1) && <Ship className="w-4 h-4" style={{ flexShrink: 0, color: 'var(--color-primary-blue)' }} title="Паром" />}
                                    {!(row?.AK === true || row?.AK === 'true' || row?.AK === '1' || row?.AK === 1) && (row.CitySender || row.CityReceiver) && (
                                        <Typography.Label style={{ fontSize: '0.85rem' }}>{[cityToCode(row.CitySender), cityToCode(row.CityReceiver)].filter(Boolean).join(' – ') || ''}</Typography.Label>
                                    )}
                                </Flex>
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
                />
            )}
            {!loading && !error && filteredItems.length === 0 && (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '2rem 0' }}>Нет счетов за выбранный период</Typography.Body>
            )}
        </div>
    );
}
