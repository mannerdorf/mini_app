import React, { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, Typography } from "@maxhub/max-ui";
import * as dateUtils from "../../../lib/dateUtils";
import { BILL_STATUS_MAP } from "../../../lib/statusUtils";
import { routeKeyToCargoLabel, type RouteFilterKey, type SharedBillStatusKey, type TypeFilterKey, formatTypeFilterSetLabel } from "../../../lib/sharedListFilters";
import { formatDateFilterButtonLabel } from "../../listWorkspace";
import { FilterDropdownPortal } from "../../../components/ui/FilterDropdownPortal";
import { CARGO_ROLE_FILTER_LABELS, type CargoRoleFilterKey } from "../../../lib/cargoUtils";
import type { DateFilter } from "../../../types";

const { getDateRange, getWeekRange, getYearsList, getWeeksList } = dateUtils;
const MONTH_NAMES = dateUtils.MONTH_NAMES;

export type DashboardFiltersBarProps = {
    useServiceRequest: boolean;
    dateFilter: DateFilter;
    setDateFilter: (v: DateFilter) => void;
    apiDateRange: { dateFrom: string; dateTo: string };
    selectedMonthForFilter: { year: number; month: number } | null;
    setSelectedMonthForFilter: (v: { year: number; month: number } | null) => void;
    selectedYearForFilter: number | null;
    setSelectedYearForFilter: (v: number | null) => void;
    selectedWeekForFilter: string | null;
    setSelectedWeekForFilter: (v: string | null) => void;
    customDateFrom: string;
    setCustomDateFrom: (v: string) => void;
    customDateTo: string;
    setCustomDateTo: (v: string) => void;
    onOpenCustomPeriod: () => void;
    billStatusFilterSet: Set<SharedBillStatusKey>;
    setBillStatusFilterSet: React.Dispatch<React.SetStateAction<Set<SharedBillStatusKey>>>;
    typeFilterSet: Set<TypeFilterKey>;
    setTypeFilterSet: React.Dispatch<React.SetStateAction<Set<TypeFilterKey>>>;
    routeFilterSet: Set<RouteFilterKey>;
    setRouteFilterSet: React.Dispatch<React.SetStateAction<Set<RouteFilterKey>>>;
    roleFilter: CargoRoleFilterKey;
    setRoleFilter: (v: CargoRoleFilterKey) => void;
};

export function DashboardFiltersBar({
    useServiceRequest,
    dateFilter,
    setDateFilter,
    apiDateRange,
    selectedMonthForFilter,
    setSelectedMonthForFilter,
    selectedYearForFilter,
    setSelectedYearForFilter,
    selectedWeekForFilter,
    setSelectedWeekForFilter,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    onOpenCustomPeriod,
    billStatusFilterSet,
    setBillStatusFilterSet,
    typeFilterSet,
    setTypeFilterSet,
    routeFilterSet,
    setRouteFilterSet,
    roleFilter,
    setRoleFilter,
}: DashboardFiltersBarProps) {
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months' | 'years' | 'weeks'>('main');
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const yearWasLongPressRef = useRef(false);
    const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const weekWasLongPressRef = useRef(false);
    const [isBillStatusDropdownOpen, setIsBillStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
    const dateButtonRef = useRef<HTMLDivElement>(null);
    const billStatusButtonRef = useRef<HTMLDivElement>(null);
    const typeButtonRef = useRef<HTMLDivElement>(null);
    const routeButtonRef = useRef<HTMLDivElement>(null);
    const roleButtonRef = useRef<HTMLDivElement>(null);

    const closeOtherDropdowns = () => {
        setIsBillStatusDropdownOpen(false);
        setIsTypeDropdownOpen(false);
        setIsRouteDropdownOpen(false);
        setIsRoleDropdownOpen(false);
    };

    return (
        <div className="cargo-page-sticky-header dashboard-sticky-filters">
            <div className="filters-container filters-row-scroll">
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); closeOtherDropdowns(); }}>
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
                                        onPointerDown={doLongPress ? () => {
                                            wasLongPressRef.current = false;
                                            timerRef.current = setTimeout(() => {
                                                timerRef.current = null;
                                                wasLongPressRef.current = true;
                                                setDateDropdownMode(mode);
                                            }, 500);
                                        } : undefined}
                                        onPointerUp={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                        onPointerLeave={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                        onClick={() => {
                                            if (doLongPress && wasLongPressRef.current) { wasLongPressRef.current = false; return; }
                                            if (key === 'период') {
                                                let r: { dateFrom: string; dateTo: string };
                                                if (dateFilter === "период") {
                                                    r = { dateFrom: customDateFrom, dateTo: customDateTo };
                                                } else if (dateFilter === "месяц" && selectedMonthForFilter) {
                                                    const { year, month } = selectedMonthForFilter;
                                                    const pad = (n: number) => String(n).padStart(2, '0');
                                                    const lastDay = new Date(year, month, 0).getDate();
                                                    r = { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                                                } else if (dateFilter === "год" && selectedYearForFilter) {
                                                    r = { dateFrom: `${selectedYearForFilter}-01-01`, dateTo: `${selectedYearForFilter}-12-31` };
                                                } else if (dateFilter === "неделя" && selectedWeekForFilter) {
                                                    r = getWeekRange(selectedWeekForFilter);
                                                } else {
                                                    r = getDateRange(dateFilter);
                                                }
                                                setCustomDateFrom(r.dateFrom);
                                                setCustomDateTo(r.dateTo);
                                            }
                                            setDateFilter(key as DateFilter);
                                            if (key === 'месяц') setSelectedMonthForFilter(null);
                                            if (key === 'год') setSelectedYearForFilter(null);
                                            if (key === 'неделя') setSelectedWeekForFilter(dateUtils.getDefaultWeekMonday());
                                            setIsDateDropdownOpen(false);
                                            if (key === 'период') onOpenCustomPeriod();
                                        }}
                                    >
                                        <Typography.Body>{key === 'год' ? 'Год' : key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                    </div>
                                );
                            })
                        )}
                    </FilterDropdownPortal>
                </div>
                {false && useServiceRequest && (
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={roleButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsRoleDropdownOpen(!isRoleDropdownOpen); setIsDateDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Роль: {CARGO_ROLE_FILTER_LABELS[roleFilter]} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={roleButtonRef} isOpen={isRoleDropdownOpen} onClose={() => setIsRoleDropdownOpen(false)}>
                        {(["all", "customer", "sender", "receiver"] as const).map((key) => (
                            <div
                                key={key}
                                className="dropdown-item"
                                onClick={() => { setRoleFilter(key); setIsRoleDropdownOpen(false); }}
                                style={{ background: roleFilter === key ? 'var(--color-bg-hover)' : undefined }}
                            >
                                <Typography.Body>{CARGO_ROLE_FILTER_LABELS[key]} {roleFilter === key ? '✓' : ''}</Typography.Body>
                            </div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                )}
                {useServiceRequest && (
                    <div className="filter-group" style={{ flexShrink: 0 }}>
                        <div ref={billStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsBillStatusDropdownOpen(!isBillStatusDropdownOpen); setIsDateDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); setIsRoleDropdownOpen(false); }}>
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
                        <Button className="filter-button" onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsDateDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsRouteDropdownOpen(false); setIsRoleDropdownOpen(false); }}>
                            Тип: {formatTypeFilterSetLabel(typeFilterSet)} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={typeButtonRef} isOpen={isTypeDropdownOpen} onClose={() => setIsTypeDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setTypeFilterSet(new Set()); setIsTypeDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setTypeFilterSet(prev => { const next = new Set(prev); if (next.has('ferry')) next.delete('ferry'); else next.add('ferry'); return next; }); }} style={{ background: typeFilterSet.has('ferry') ? 'var(--color-bg-hover)' : undefined }}><Typography.Body>Паром {typeFilterSet.has('ferry') ? '✓' : ''}</Typography.Body></div>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setTypeFilterSet(prev => { const next = new Set(prev); if (next.has('auto')) next.delete('auto'); else next.add('auto'); return next; }); }} style={{ background: typeFilterSet.has('auto') ? 'var(--color-bg-hover)' : undefined }}><Typography.Body>Авто {typeFilterSet.has('auto') ? '✓' : ''}</Typography.Body></div>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setTypeFilterSet(prev => { const next = new Set(prev); if (next.has('air')) next.delete('air'); else next.add('air'); return next; }); }} style={{ background: typeFilterSet.has('air') ? 'var(--color-bg-hover)' : undefined }}><Typography.Body>Авиа {typeFilterSet.has('air') ? '✓' : ''}</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={routeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsRouteDropdownOpen(!isRouteDropdownOpen); setIsDateDropdownOpen(false); setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); }}>
                            Маршрут: {routeFilterSet.size === 0 ? 'Все' : routeFilterSet.size === 2 ? 'Выбрано: 2' : routeKeyToCargoLabel([...routeFilterSet][0])} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={routeButtonRef} isOpen={isRouteDropdownOpen} onClose={() => setIsRouteDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setRouteFilterSet(new Set()); setIsRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {(['MSK-KGD', 'KGD-MSK'] as const).map(key => (
                            <div key={key} className="dropdown-item" onClick={(e) => { e.stopPropagation(); setRouteFilterSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} style={{ background: routeFilterSet.has(key) ? 'var(--color-bg-hover)' : undefined }}>
                                <Typography.Body>{routeKeyToCargoLabel(key)} {routeFilterSet.has(key) ? '✓' : ''}</Typography.Body>
                            </div>
                        ))}
                    </FilterDropdownPortal>
                </div>
            </div>
        </div>
    );
}
