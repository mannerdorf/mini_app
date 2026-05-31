/**
 * Сводка по выдаче грузов: плитки и таблица по датам верхнего фильтра дашборда.
 */
import React, { useMemo, useCallback, useState, useEffect } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, List, Loader2, RefreshCw, RussianRuble, Scale, Weight } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { AppBadge } from "./shared/AppBadge";
import type { AuthData, CargoItem, PerevozkaTimelineStep } from "../types";
import { parseDateOnly } from "../lib/dateUtils";
import { getFilterKeyByStatus, isReceivedInfoStatus } from "../lib/statusUtils";
import { cityToCode, formatCurrency, formatInvoiceNumber, stripOoo } from "../lib/formatUtils";
import { rowIsOutsideSla } from "./haulzDispatchTableUtils";
import { fetchPerevozkaTimeline } from "../lib/perevozkaDetails";
import type { WorkSchedule } from "../lib/slaWorkSchedule";
import type { KeyedMutator } from "swr";
import { useAppRuntime } from "../contexts/AppRuntimeContext";
import { HaulzDispatchShipmentRows } from "./HaulzDispatchShipmentRows";
import { dispatchStatusDateSortKey } from "./haulzDispatchTableUtils";

export type HaulzDispatchSummaryProps = {
    auth: AuthData;
    useServiceRequest?: boolean;
    onOpenCargo: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
    /** Те же перевозки, что уже загружены дашбордом по верхнему фильтру дат (без второго запроса). */
    perevozkiItems: CargoItem[];
    perevozkiLoading: boolean;
    perevozkiError: string | null;
    perevozkiMutate: KeyedMutator<CargoItem[]>;
    title?: string;
    subtitle?: string;
    showRefreshButton?: boolean;
    /** Показывать суммы в рублях на плитках (как в таблице «Сумма»). */
    showSums?: boolean;
};

type DispatchTileKey = "ready" | "delivering" | "transit" | "delivered" | "total";

const TABLE_MAX_ROWS = 60;
const DISPATCH_TABLE_COLS = 8;
/** Сколько перевозок показывать при раскрытии заказчика до «Ещё». */
const CUSTOMER_GROUP_PREVIEW_ROWS = 5;
/** Вертикальный скролл таблицы, если перевозок больше этого числа (как в блоке неоплаченных счетов). */
const DISPATCH_TABLE_SCROLL_AFTER_ROWS = 5;

type DispatchTableSortCol = "number" | "customer" | "statusDate" | "datePrih" | "pw" | "sum";

function compareCargoNumbersForSort(a: string, b: string): number {
    const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
    if (na !== nb) return na - nb;
    return a.localeCompare(b, "ru");
}

function compareDispatchRows(
    a: CargoItem,
    b: CargoItem,
    column: DispatchTableSortCol,
    order: "asc" | "desc",
): number {
    const dir = order === "asc" ? 1 : -1;
    switch (column) {
        case "number": {
            const sa = String(a.Number ?? "").trim();
            const sb = String(b.Number ?? "").trim();
            return compareCargoNumbersForSort(sa, sb) * dir;
        }
        case "customer": {
            const ca = stripOoo(String(a.Customer ?? (a as { customer?: string }).customer ?? "—")).toLowerCase();
            const cb = stripOoo(String(b.Customer ?? (b as { customer?: string }).customer ?? "—")).toLowerCase();
            return ca.localeCompare(cb, "ru") * dir;
        }
        case "statusDate": {
            const da = dispatchStatusDateSortKey(a);
            const db = dispatchStatusDateSortKey(b);
            return da.localeCompare(db) * dir;
        }
        case "datePrih": {
            const ta = parseDateOnly(String(a.DatePrih ?? "").trim())?.getTime() ?? 0;
            const tb = parseDateOnly(String(b.DatePrih ?? "").trim())?.getTime() ?? 0;
            return (ta - tb) * dir;
        }
        case "pw": {
            const pa = typeof a.PW === "string" ? parseFloat(a.PW) || 0 : Number(a.PW) || 0;
            const pb = typeof b.PW === "string" ? parseFloat(b.PW) || 0 : Number(b.PW) || 0;
            return (pa - pb) * dir;
        }
        case "sum": {
            const sa = typeof a.Sum === "string" ? parseFloat(a.Sum) || 0 : Number(a.Sum) || 0;
            const sb = typeof b.Sum === "string" ? parseFloat(b.Sum) || 0 : Number(b.Sum) || 0;
            return (sa - sb) * dir;
        }
        default:
            return 0;
    }
}

function normalizeDispatchTimelineError(message?: string | null): string {
    const raw = String(message || "").trim();
    if (!raw) return "Не удалось загрузить статусы";
    const lower = raw.toLowerCase();
    if (lower.includes("перевозка не найдена") || lower.includes("not found")) {
        return "Нет статусов по этой перевозке";
    }
    return raw;
}

function sumPw(items: CargoItem[]): number {
    return items.reduce((acc, it) => {
        const v = typeof it.PW === "string" ? parseFloat(it.PW) || 0 : Number(it.PW) || 0;
        return acc + v;
    }, 0);
}

function sumVol(items: CargoItem[]): number {
    return items.reduce((acc, it) => {
        const raw = it.Value;
        const v =
            typeof raw === "string"
                ? parseFloat(String(raw).replace(",", ".")) || 0
                : Number(raw) || 0;
        return acc + v;
    }, 0);
}

function sumW(items: CargoItem[]): number {
    return items.reduce((acc, it) => {
        const v = typeof it.W === "string" ? parseFloat(String(it.W).replace(",", ".")) || 0 : Number(it.W) || 0;
        return acc + v;
    }, 0);
}

function sumMoney(items: CargoItem[]): number {
    return items.reduce((acc, it) => {
        const v = typeof it.Sum === "string" ? parseFloat(it.Sum) || 0 : Number(it.Sum) || 0;
        return acc + v;
    }, 0);
}

function formatVolumeM3(vol: number): string {
    const n = Number(vol) || 0;
    return n.toFixed(2).replace(".", ",");
}

const TILE_ICON_SIZE = 13;
const tileIconStyle: React.CSSProperties = {
    flexShrink: 0,
    color: "var(--color-text-secondary)",
    opacity: 0.92,
};

/** Строка под числом на плитке: сумма, платный вес, вес и объём. */
function TileMetricsFooter({ items, showSums = true }: { items: CargoItem[]; showSums?: boolean }) {
    const pw = Math.round(sumPw(items));
    const w = Math.round(sumW(items));
    const vol = sumVol(items);
    const volStr = formatVolumeM3(vol);
    const money = sumMoney(items);
    return (
        <Flex
            align="center"
            wrap="wrap"
            gap="0.35rem"
            className="haulz-dispatch-stat-tile__metrics"
            style={{ marginTop: "0.2rem", rowGap: "0.15rem" }}
        >
            {showSums ? (
                <>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }} title="Сумма">
                        <RussianRuble width={TILE_ICON_SIZE} height={TILE_ICON_SIZE} style={tileIconStyle} aria-hidden />
                        <Typography.Body style={{ fontSize: "0.62rem", color: "var(--color-text-secondary)", lineHeight: 1.25 }}>
                            {formatCurrency(money, true)}
                        </Typography.Body>
                    </span>
                    <span style={{ fontSize: "0.62rem", color: "var(--color-text-secondary)", opacity: 0.45 }} aria-hidden>
                        ·
                    </span>
                </>
            ) : null}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }} title="Платный вес">
                <Scale width={TILE_ICON_SIZE} height={TILE_ICON_SIZE} style={tileIconStyle} aria-hidden />
                <Typography.Body style={{ fontSize: "0.62rem", color: "var(--color-text-secondary)", lineHeight: 1.25 }}>
                    {pw.toLocaleString("ru-RU")} кг
                </Typography.Body>
            </span>
            <span style={{ fontSize: "0.62rem", color: "var(--color-text-secondary)", opacity: 0.45 }} aria-hidden>
                ·
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }} title="Вес">
                <Weight width={TILE_ICON_SIZE} height={TILE_ICON_SIZE} style={tileIconStyle} aria-hidden />
                <Typography.Body style={{ fontSize: "0.62rem", color: "var(--color-text-secondary)", lineHeight: 1.25 }}>
                    {w.toLocaleString("ru-RU")} кг
                </Typography.Body>
            </span>
            <span style={{ fontSize: "0.62rem", color: "var(--color-text-secondary)", opacity: 0.45 }} aria-hidden>
                ·
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }} title="Объём">
                <List width={TILE_ICON_SIZE} height={TILE_ICON_SIZE} style={tileIconStyle} aria-hidden />
                <Typography.Body style={{ fontSize: "0.62rem", color: "var(--color-text-secondary)", lineHeight: 1.25 }}>
                    {volStr} м³
                </Typography.Body>
            </span>
        </Flex>
    );
}

function sortByArrivalDesc(list: CargoItem[]): CargoItem[] {
    return [...list].sort((a, b) => {
        const ta = parseDateOnly(String(a.DatePrih ?? ""))?.getTime() ?? 0;
        const tb = parseDateOnly(String(b.DatePrih ?? ""))?.getTime() ?? 0;
        return tb - ta;
    });
}

function cargoCustomerGroupKey(row: CargoItem): string {
    const cust = stripOoo(String(row.Customer ?? (row as { customer?: string }).customer ?? "—")).trim();
    return cust || "—";
}

export function HaulzDispatchSummary({
    auth,
    useServiceRequest = false,
    onOpenCargo,
    perevozkiItems: rawItems,
    perevozkiLoading: loading,
    perevozkiError: error,
    perevozkiMutate: mutate,
    title,
    subtitle,
    showRefreshButton,
    showSums = true,
}: HaulzDispatchSummaryProps) {
    const { showCustomerColumn } = useAppRuntime();
    const [workScheduleByInn, setWorkScheduleByInn] = useState<Record<string, WorkSchedule>>({});
    const [selectedTile, setSelectedTile] = useState<DispatchTileKey>("total");
    const [dispatchTableSort, setDispatchTableSort] = useState<{
        column: DispatchTableSortCol | null;
        order: "asc" | "desc";
    }>({ column: null, order: "desc" });
    const [expandedDispatchNumber, setExpandedDispatchNumber] = useState<string | null>(null);
    const [expandedDispatchItem, setExpandedDispatchItem] = useState<CargoItem | null>(null);
    const [dispatchTimelineSteps, setDispatchTimelineSteps] = useState<PerevozkaTimelineStep[]>([]);
    const [dispatchTimelineLoading, setDispatchTimelineLoading] = useState(false);
    const [dispatchTimelineError, setDispatchTimelineError] = useState<string | null>(null);
    /** Таблица под плитками: по умолчанию развёрнута. */
    const [dispatchTableOpen, setDispatchTableOpen] = useState(true);
    /** Свернутая таблица по заказчику; по клику — строки перевозок этого заказчика. */
    const [expandedCustomerKey, setExpandedCustomerKey] = useState<string | null>(null);
    /** Заказчики, у которых в раскрытой группе показаны все перевозки (не только превью). */
    const [customerGroupShowAllKeys, setCustomerGroupShowAllKeys] = useState<Set<string>>(() => new Set());

    const items = useMemo(() => rawItems.filter((i) => !isReceivedInfoStatus(i.State)), [rawItems]);

    useEffect(() => {
        if (!auth?.login || !auth?.password) return;
        const inns = [
            ...new Set(
                items
                    .map((i) => (i?.INN ?? i?.Inn ?? i?.inn ?? "").toString().trim())
                    .filter((inn): inn is string => inn.length > 0),
            ),
        ];
        if (inns.length === 0) return;
        let cancelled = false;
        fetch("/api/customer-work-schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: auth.login, password: auth.password, inns }),
        })
            .then((r) => r.json())
            .then((data: { items?: { inn: string; days_of_week: number[]; work_start: string; work_end: string }[] }) => {
                if (cancelled) return;
                const ws: Record<string, WorkSchedule> = {};
                (data?.items ?? []).forEach((r) => {
                    if (r?.inn)
                        ws[r.inn.trim()] = {
                            days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5],
                            work_start: r.work_start || "09:00",
                            work_end: r.work_end || "18:00",
                        };
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => {
                /* ignore */
            });
        return () => {
            cancelled = true;
        };
    }, [auth?.login, auth?.password, items]);

    const stats = useMemo(() => {
        const ready: CargoItem[] = [];
        const delivering: CargoItem[] = [];
        const transit: CargoItem[] = [];
        const delivered: CargoItem[] = [];

        for (const it of items) {
            const k = getFilterKeyByStatus(it.State);
            if (k === "ready") ready.push(it);
            else if (k === "delivering") delivering.push(it);
            else if (k === "in_transit") transit.push(it);
            else if (k === "delivered") delivered.push(it);
        }

        return {
            ready,
            delivering,
            transit,
            delivered,
            total: items.length,
        };
    }, [items]);

    const listByTile: Record<DispatchTileKey, CargoItem[]> = useMemo(
        () => ({
            ready: sortByArrivalDesc(stats.ready),
            delivering: sortByArrivalDesc(stats.delivering),
            transit: sortByArrivalDesc(stats.transit),
            delivered: sortByArrivalDesc(stats.delivered),
            total: sortByArrivalDesc(items),
        }),
        [stats.ready, stats.delivering, stats.transit, stats.delivered, items],
    );

    useEffect(() => {
        setDispatchTableSort({ column: null, order: "desc" });
        setExpandedDispatchNumber(null);
        setExpandedDispatchItem(null);
        setExpandedCustomerKey(null);
        setCustomerGroupShowAllKeys(new Set());
        setDispatchTableOpen(true);
    }, [selectedTile]);

    useEffect(() => {
        setExpandedDispatchNumber(null);
        setExpandedDispatchItem(null);
    }, [expandedCustomerKey]);

    useEffect(() => {
        if (dispatchTableOpen) return;
        setExpandedCustomerKey(null);
        setExpandedDispatchNumber(null);
        setExpandedDispatchItem(null);
        setCustomerGroupShowAllKeys(new Set());
    }, [dispatchTableOpen]);

    useEffect(() => {
        if (!expandedDispatchNumber || !expandedDispatchItem || !auth?.login || !auth?.password) {
            setDispatchTimelineSteps([]);
            setDispatchTimelineError(null);
            return;
        }
        let cancelled = false;
        setDispatchTimelineLoading(true);
        setDispatchTimelineError(null);
        setDispatchTimelineSteps([]);
        fetchPerevozkaTimeline(auth, expandedDispatchNumber, expandedDispatchItem, {
            forceServiceAuth: !!useServiceRequest,
        })
            .then((steps) => {
                if (!cancelled) setDispatchTimelineSteps(steps ?? []);
            })
            .catch((e: unknown) => {
                if (!cancelled)
                    setDispatchTimelineError(normalizeDispatchTimelineError((e as Error)?.message));
            })
            .finally(() => {
                if (!cancelled) setDispatchTimelineLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [expandedDispatchNumber, expandedDispatchItem, auth?.login, auth?.password, useServiceRequest]);

    const onDispatchSortHeaderClick = useCallback((column: DispatchTableSortCol) => {
        setDispatchTableSort((prev) =>
            prev.column === column
                ? { column, order: prev.order === "asc" ? "desc" : "asc" }
                : { column, order: "asc" },
        );
    }, []);

    const sortedTableSource = useMemo(() => {
        const base = listByTile[selectedTile];
        const { column, order } = dispatchTableSort;
        if (!column) return base;
        return [...base].sort((a, b) => compareDispatchRows(a, b, column, order));
    }, [listByTile, selectedTile, dispatchTableSort]);

    const tableRows = useMemo(() => sortedTableSource.slice(0, TABLE_MAX_ROWS), [sortedTableSource]);
    const dispatchTableScrollable = tableRows.length > DISPATCH_TABLE_SCROLL_AFTER_ROWS;

    const dispatchTableColCount = showCustomerColumn ? DISPATCH_TABLE_COLS : DISPATCH_TABLE_COLS - 1;
    /** Один логин — одна организация: без группировки по заказчику. */
    const flatDispatchTable = !showCustomerColumn;

    const onToggleDispatchRow = useCallback((num: string, row: CargoItem | null) => {
        if (row) {
            setExpandedDispatchNumber(num);
            setExpandedDispatchItem(row);
        } else {
            setExpandedDispatchNumber(null);
            setExpandedDispatchItem(null);
        }
    }, []);

    const customerGroups = useMemo(() => {
        const order: string[] = [];
        const map = new Map<string, CargoItem[]>();
        for (const row of tableRows) {
            const key = cargoCustomerGroupKey(row);
            if (!map.has(key)) {
                order.push(key);
                map.set(key, []);
            }
            map.get(key)!.push(row);
        }
        return order.map((customerKey) => ({ customerKey, rows: map.get(customerKey)! }));
    }, [tableRows]);

    const refresh = useCallback(() => {
        void mutate(undefined, { revalidate: true });
        try {
            window.dispatchEvent(new Event("haulz-service-refresh"));
        } catch {
            /* ignore */
        }
    }, [mutate]);

    const StatCard = ({
        tileKey,
        cardTitle,
        count,
        footer,
        accent,
    }: {
        tileKey: DispatchTileKey;
        cardTitle: string;
        count: number;
        footer: React.ReactNode;
        accent: string;
    }) => {
        const selected = selectedTile === tileKey;
        return (
            <Panel
                role="button"
                tabIndex={0}
                className="cargo-card haulz-dispatch-stat-tile"
                onClick={() => setSelectedTile(tileKey)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedTile(tileKey);
                    }
                }}
                style={{
                    flex: "1 1 140px",
                    minWidth: 140,
                    padding: "0.85rem 1rem",
                    borderRadius: 12,
                    borderLeft: `4px solid ${accent}`,
                    borderTop: selected ? "2px solid var(--color-primary-blue)" : "1px solid var(--color-border)",
                    borderRight: selected ? "2px solid var(--color-primary-blue)" : "1px solid var(--color-border)",
                    borderBottom: selected ? "2px solid var(--color-primary-blue)" : "1px solid var(--color-border)",
                    background: "var(--color-bg-card)",
                    cursor: "pointer",
                    boxSizing: "border-box",
                    outline: "none",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                }}
            >
                <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>{cardTitle}</Typography.Body>
                <Typography.Headline style={{ fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.2 }}>{count.toLocaleString("ru-RU")}</Typography.Headline>
                {footer}
            </Panel>
        );
    };

    const showHeader = Boolean(title || subtitle || showRefreshButton);

    return (
        <div className="w-full" style={{ maxWidth: "100%", minWidth: 0, marginBottom: "1rem" }}>
            {showHeader && (
                <Flex align="flex-start" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.75rem" }}>
                    <div>
                        {title ? (
                            <Typography.Headline style={{ fontSize: "1.05rem", fontWeight: 600 }}>{title}</Typography.Headline>
                        ) : null}
                        {subtitle ? (
                            <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginTop: title ? "0.2rem" : 0 }}>
                                {subtitle}
                            </Typography.Body>
                        ) : null}
                    </div>
                    {showRefreshButton ? (
                        <Button type="button" className="filter-button" onClick={() => refresh()} disabled={loading} title="Обновить данные">
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                    ) : null}
                </Flex>
            )}

            {loading && rawItems.length === 0 && (
                <Flex justify="center" style={{ padding: "1.5rem" }}>
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--color-primary-blue)" }} />
                </Flex>
            )}

            {error && (
                <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem", borderRadius: 12, border: "1px solid var(--color-error-border)", background: "var(--color-error-bg)" }}>
                    <Typography.Body style={{ color: "#b91c1c" }}>
                        {typeof error === "string" ? error : String((error as Error)?.message || error)}
                    </Typography.Body>
                </Panel>
            )}

            {!loading && !error && (
                <>
                    <div className="haulz-dispatch-stat-grid" style={{ marginBottom: "1rem" }}>
                        <StatCard tileKey="total" cardTitle="Всего в выборке" count={stats.total} footer={<TileMetricsFooter items={items} showSums={showSums} />} accent="#2563eb" />
                        <StatCard
                            tileKey="delivered"
                            cardTitle="Доставлено"
                            count={stats.delivered.length}
                            footer={<TileMetricsFooter items={stats.delivered} showSums={showSums} />}
                            accent="#10b981"
                        />
                        <StatCard
                            tileKey="transit"
                            cardTitle="В пути"
                            count={stats.transit.length}
                            footer={<TileMetricsFooter items={stats.transit} showSums={showSums} />}
                            accent="#f59e0b"
                        />
                        <StatCard
                            tileKey="ready"
                            cardTitle="Готов к выдаче"
                            count={stats.ready.length}
                            footer={<TileMetricsFooter items={stats.ready} showSums={showSums} />}
                            accent="#8b5cf6"
                        />
                        <StatCard
                            tileKey="delivering"
                            cardTitle="На доставке"
                            count={stats.delivering.length}
                            footer={<TileMetricsFooter items={stats.delivering} showSums={showSums} />}
                            accent="#06b6d4"
                        />
                    </div>

                    <Panel className="cargo-card" style={{ padding: dispatchTableOpen ? "1rem 1.1rem" : "0.65rem 0.85rem", borderRadius: 12, background: "var(--color-bg-card)" }}>
                        {tableRows.length === 0 ? (
                            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет перевозок в этом разделе за период.</Typography.Body>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setDispatchTableOpen((open) => !open)}
                                    aria-expanded={dispatchTableOpen}
                                    title={dispatchTableOpen ? "Свернуть таблицу" : "Развернуть таблицу"}
                                    style={{
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.45rem",
                                        padding: 0,
                                        margin: 0,
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        color: "inherit",
                                    }}
                                >
                                    {dispatchTableOpen ? (
                                        <ChevronDown className="w-4 h-4" style={{ flexShrink: 0, opacity: 0.85 }} aria-hidden />
                                    ) : (
                                        <ChevronRight className="w-4 h-4" style={{ flexShrink: 0, opacity: 0.85 }} aria-hidden />
                                    )}
                                    <List className="w-4 h-4" style={{ flexShrink: 0, opacity: 0.75 }} aria-hidden />
                                    <span className="haulz-dispatch-table-panel__title">
                                        {flatDispatchTable ? "Перевозки" : "Перевозки по заказчикам"}
                                    </span>
                                    <span className="haulz-dispatch-table-panel__meta">
                                        {flatDispatchTable
                                            ? `${tableRows.length} пер.`
                                            : `${customerGroups.length} зак. · ${tableRows.length} пер.`}
                                    </span>
                                </button>
                                {dispatchTableOpen && (
                            <div
                                className={
                                    dispatchTableScrollable
                                        ? "haulz-dispatch-table-wrap haulz-dispatch-table-wrap--scroll"
                                        : "haulz-dispatch-table-wrap"
                                }
                            >
                                <table className="haulz-dispatch-table">
                                    <thead>
                                        <tr className="haulz-dispatch-table__head-row">
                                            {(
                                                [
                                                    { col: "number" as const, label: "№", align: "left" as const },
                                                    ...(showCustomerColumn
                                                        ? [{ col: "customer" as const, label: "Заказчик", align: "left" as const }]
                                                        : []),
                                                    { col: "statusDate" as const, label: "Дата статуса", align: "left" as const },
                                                    { col: "datePrih" as const, label: "Приход", align: "left" as const },
                                                    { col: null, label: "Маршрут", align: "left" as const, title: "Маршрут" },
                                                    { col: null, label: "", align: "center" as const, title: "Тип перевозки" },
                                                    { col: "pw" as const, label: "Плат. вес", align: "right" as const },
                                                    { col: "sum" as const, label: "Сумма", align: "right" as const },
                                                ] as const
                                            ).map(({ col, label, align, title: thTitle }) => {
                                                const active = col != null && dispatchTableSort.column === col;
                                                const SortIcon = dispatchTableSort.order === "asc" ? ArrowUp : ArrowDown;
                                                return (
                                                    <th
                                                        key={col ?? (label || thTitle)}
                                                        role="columnheader"
                                                        aria-sort={
                                                            !active ? "none" : dispatchTableSort.order === "asc" ? "ascending" : "descending"
                                                        }
                                                        onClick={
                                                            col
                                                                ? (e) => {
                                                            e.stopPropagation();
                                                            onDispatchSortHeaderClick(col);
                                                                  }
                                                                : undefined
                                                        }
                                                        title={col ? "Сортировка по столбцу" : thTitle}
                                                        className="haulz-dispatch-table__th"
                                                        style={{
                                                            textAlign: align,
                                                            cursor: col ? "pointer" : "default",
                                                            userSelect: "none",
                                                            width: col == null && label === "" ? "2.5rem" : undefined,
                                                        }}
                                                    >
                                                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", justifyContent: align === "right" ? "flex-end" : "flex-start", width: align === "right" ? "100%" : undefined }}>
                                                            {label}
                                                            {active ? (
                                                                <SortIcon className="w-3 h-3" style={{ flexShrink: 0, opacity: 0.85 }} aria-hidden />
                                                            ) : null}
                                                        </span>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {flatDispatchTable ? (
                                            <HaulzDispatchShipmentRows
                                                rows={tableRows}
                                                rowKeyPrefix={selectedTile}
                                                showCustomerColumn={showCustomerColumn}
                                                workScheduleByInn={workScheduleByInn}
                                                expandedDispatchNumber={expandedDispatchNumber}
                                                expandedDispatchItem={expandedDispatchItem}
                                                onToggleDispatchRow={onToggleDispatchRow}
                                                dispatchTableColCount={dispatchTableColCount}
                                                dispatchTimelineSteps={dispatchTimelineSteps}
                                                dispatchTimelineLoading={dispatchTimelineLoading}
                                                dispatchTimelineError={dispatchTimelineError}
                                                onOpenCargo={onOpenCargo}
                                            />
                                        ) : (
                                        customerGroups.map(({ customerKey, rows }) => {
                                            const groupOpen = expandedCustomerKey === customerKey;
                                            const showAllGroupRows = customerGroupShowAllKeys.has(customerKey);
                                            const previewRows = showAllGroupRows
                                                ? rows
                                                : rows.slice(0, CUSTOMER_GROUP_PREVIEW_ROWS);
                                            const hiddenGroupRows = rows.length - previewRows.length;
                                            const totalPw = rows.reduce((acc, row) => {
                                                const p = typeof row.PW === "string" ? parseFloat(row.PW) || 0 : Number(row.PW) || 0;
                                                return acc + p;
                                            }, 0);
                                            const totalSum = rows.reduce((acc, row) => {
                                                const s = typeof row.Sum === "string" ? parseFloat(row.Sum) || 0 : Number(row.Sum) || 0;
                                                return acc + s;
                                            }, 0);
                                            const groupSlaLate = rows.some((row) => rowIsOutsideSla(row, workScheduleByInn));
                                            return (
                                                <React.Fragment key={`${selectedTile}-grp-${customerKey}`}>
                                                    <tr
                                                        onClick={() => {
                                                            if (groupOpen) {
                                                                setExpandedCustomerKey(null);
                                                                setCustomerGroupShowAllKeys((prev) => {
                                                                    const next = new Set(prev);
                                                                    next.delete(customerKey);
                                                                    return next;
                                                                });
                                                            } else {
                                                                setExpandedCustomerKey(customerKey);
                                                            }
                                                        }}
                                                        style={{
                                                            borderBottom: "1px solid var(--color-border)",
                                                            cursor: "pointer",
                                                            background: groupSlaLate
                                                                ? "var(--color-error-bg)"
                                                                : "var(--color-bg-hover)",
                                                        }}
                                                        aria-expanded={groupOpen}
                                                        title={groupOpen ? "Свернуть список перевозок" : "Показать перевозки заказчика"}
                                                    >
                                                        <td style={{ padding: "0.35rem", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                                                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                                                {groupOpen ? (
                                                                    <ChevronDown className="w-4 h-4" style={{ flexShrink: 0, opacity: 0.85 }} aria-hidden />
                                                                ) : (
                                                                    <ChevronRight className="w-4 h-4" style={{ flexShrink: 0, opacity: 0.85 }} aria-hidden />
                                                                )}
                                                                {!showCustomerColumn && (
                                                                    <span style={{ fontWeight: 600, fontSize: "0.78rem" }} title={customerKey}>
                                                                        {customerKey}
                                                                    </span>
                                                                )}
                                                                <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
                                                                    {rows.length}
                                                                </Typography.Body>
                                                            </span>
                                                        </td>
                                                        {showCustomerColumn && (
                                                        <td
                                                            className="customer-col"
                                                            style={{
                                                                padding: "0.35rem",
                                                                maxWidth: 220,
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                                fontWeight: 600,
                                                            }}
                                                            title={customerKey}
                                                        >
                                                            {customerKey}
                                                        </td>
                                                        )}
                                                        <td style={{ padding: "0.35rem", fontSize: "0.72rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                                                            —
                                                        </td>
                                                        <td style={{ padding: "0.35rem", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>—</td>
                                                        <td style={{ padding: "0.35rem", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>—</td>
                                                        <td style={{ padding: "0.35rem", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>—</td>
                                                        <td style={{ padding: "0.35rem", textAlign: "right" }}>{Math.round(totalPw).toLocaleString("ru-RU")}</td>
                                                        <td style={{ padding: "0.35rem", textAlign: "right" }}>{formatCurrency(totalSum, true)}</td>
                                                    </tr>
                                                    {groupOpen && (
                                                        <HaulzDispatchShipmentRows
                                                            rows={previewRows}
                                                            rowKeyPrefix={`${selectedTile}-${customerKey}`}
                                                            showCustomerColumn={showCustomerColumn}
                                                            workScheduleByInn={workScheduleByInn}
                                                            expandedDispatchNumber={expandedDispatchNumber}
                                                            expandedDispatchItem={expandedDispatchItem}
                                                            onToggleDispatchRow={onToggleDispatchRow}
                                                            dispatchTableColCount={dispatchTableColCount}
                                                            dispatchTimelineSteps={dispatchTimelineSteps}
                                                            dispatchTimelineLoading={dispatchTimelineLoading}
                                                            dispatchTimelineError={dispatchTimelineError}
                                                            onOpenCargo={onOpenCargo}
                                                            nestedFirstColumn
                                                        />
                                                    )}
                                                    {groupOpen && hiddenGroupRows > 0 && (
                                                                        <tr>
                                                                            <td
                                                                colSpan={dispatchTableColCount}
                                                                                style={{
                                                                    padding: "0.35rem 0.35rem 0.35rem 1.5rem",
                                                                                    borderBottom: "1px solid var(--color-border)",
                                                                }}
                                                            >
                                                                <button
                                                                                        type="button"
                                                                    className="haulz-dispatch-group-more"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                        setCustomerGroupShowAllKeys((prev) => {
                                                                            const next = new Set(prev);
                                                                            next.add(customerKey);
                                                                            return next;
                                                                        });
                                                                    }}
                                                                >
                                                                    Ещё {hiddenGroupRows}
                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                                )}
                            </>
                        )}
                    </Panel>
                </>
            )}
        </div>
    );
}
