/**
 * Сводка по выдаче грузов: период (сегодня / вчера / 7 дней / 30 дней / произвольный), плитки и таблица.
 * Блок на главном дашборде (при праве haulz).
 */
import React, { useMemo, useCallback, useState, useEffect } from "react";
import { ArrowDown, ArrowUp, Loader2, RefreshCw } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { AuthData, CargoItem, DateFilter, PerevozkaTimelineStep } from "../types";
import { formatTimelineDate, formatTimelineTime, getDateRange, getTodayDate, parseDateOnly } from "../lib/dateUtils";
import { getFilterKeyByStatus, isReceivedInfoStatus } from "../lib/statusUtils";
import { formatCurrency, formatInvoiceNumber, stripOoo } from "../lib/formatUtils";
import { getPlanDays, getSlaInfo } from "../lib/cargoUtils";
import { fetchPerevozkaTimeline } from "../lib/perevozkaDetails";
import type { WorkSchedule } from "../lib/slaWorkSchedule";
import { usePerevozki } from "../hooks/useApi";
import { CustomPeriodModal } from "./modals/CustomPeriodModal";

export type HaulzDispatchSummaryProps = {
    auth: AuthData;
    useServiceRequest?: boolean;
    onOpenCargo: (cargoNumber: string) => void;
    title?: string;
    subtitle?: string;
    showRefreshButton?: boolean;
};

/** Быстрый период блока (кнопки + «Период» через модалку). */
type HaulzPeriodQuick = Exclude<DateFilter, "все" | "год">;

type DispatchTileKey = "ready" | "delivering" | "transit" | "delivered" | "arrived_today" | "total";

const TABLE_MAX_ROWS = 60;

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
            const da = normalizeDateOnlyForCell(pickApiFilterDateRaw(a)) || "9999-12-31";
            const db = normalizeDateOnlyForCell(pickApiFilterDateRaw(b)) || "9999-12-31";
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

const QUEUE_TITLE: Record<DispatchTileKey, string> = {
    ready: "Очередь «Готов к выдаче»",
    delivering: "Перевозки «На доставке»",
    transit: "Перевозки «В пути»",
    delivered: "Перевозки «Доставлено»",
    arrived_today: "Перевозки «Прибыло сегодня»",
    total: "Все перевозки в выборке",
};

function normalizeDispatchTimelineError(message?: string | null): string {
    const raw = String(message || "").trim();
    if (!raw) return "Не удалось загрузить статусы";
    const lower = raw.toLowerCase();
    if (lower.includes("перевозка не найдена") || lower.includes("not found")) {
        return "Нет статусов по этой перевозке";
    }
    return raw;
}

const QUICK_FILTERS: { key: HaulzPeriodQuick; label: string }[] = [
    { key: "сегодня", label: "Сегодня" },
    { key: "вчера", label: "Вчера" },
    { key: "неделя", label: "7 дней" },
    { key: "месяц", label: "30 дней" },
];

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

function formatVolumeM3(vol: number): string {
    const n = Number(vol) || 0;
    return n.toFixed(2).replace(".", ",");
}

/** Подпись под числом на плитке: платный вес и объём груза. */
function tilePwVolCaption(items: CargoItem[]): string {
    const pw = Math.round(sumPw(items));
    const vol = sumVol(items);
    return `платный вес ${pw.toLocaleString("ru-RU")} кг · объём ${formatVolumeM3(vol)} м³`;
}

function sortByArrivalDesc(list: CargoItem[]): CargoItem[] {
    return [...list].sort((a, b) => {
        const ta = parseDateOnly(String(a.DatePrih ?? ""))?.getTime() ?? 0;
        const tb = parseDateOnly(String(b.DatePrih ?? ""))?.getTime() ?? 0;
        return tb - ta;
    });
}

/**
 * Дата, по которой API `/api/sendings` отфильтровывает перевозку в период (см. `pickDate` в api/sendings.ts).
 */
function pickApiFilterDateRaw(cargo: CargoItem): unknown {
    const c = cargo as Record<string, unknown>;
    return (
        c.DateOtpr ??
        c.DateSend ??
        c.DateShipment ??
        c.ShipmentDate ??
        c.DateDoc ??
        c.Date ??
        c.date ??
        c.ДатаОтправки ??
        c.Дата ??
        c.DatePrih ??
        c.DateVr
    );
}

function normalizeDateOnlyForCell(raw: unknown): string {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\D.*)?$/);
    if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
    const parsed = parseDateOnly(s);
    if (parsed) return parsed.toISOString().split("T")[0];
    const fallback = new Date(s);
    if (Number.isNaN(fallback.getTime())) return "";
    return fallback.toISOString().split("T")[0];
}

function formatDispatchFilterDateCell(cargo: CargoItem): string {
    const d = normalizeDateOnlyForCell(pickApiFilterDateRaw(cargo));
    return d || "—";
}

/** SLA как в списке грузов; для незавершённых без DateVr — конец интервала «сегодня». */
function getDispatchRowSla(item: CargoItem, workScheduleByInn: Record<string, WorkSchedule>) {
    let sla = getSlaInfo(item, workScheduleByInn);
    if (sla) return sla;
    const statusKey = getFilterKeyByStatus(String(item.State ?? ""));
    if (statusKey === "delivered") return null;
    if (!item.DatePrih || !String(item.DatePrih).trim()) return null;
    const vr = String(item.DateVr ?? "").trim();
    if (vr) return null;
    const todayStr = new Date().toISOString().split("T")[0];
    return getSlaInfo({ ...item, DateVr: todayStr }, workScheduleByInn);
}

function rowIsOutsideSla(item: CargoItem, workScheduleByInn: Record<string, WorkSchedule>): boolean {
    const sla = getDispatchRowSla(item, workScheduleByInn);
    return sla != null && !sla.onTime;
}

export function HaulzDispatchSummary({
    auth,
    useServiceRequest = false,
    onOpenCargo,
    title,
    subtitle,
    showRefreshButton,
}: HaulzDispatchSummaryProps) {
    const todayKey = getTodayDate();
    const [workScheduleByInn, setWorkScheduleByInn] = useState<Record<string, WorkSchedule>>({});
    const [selectedTile, setSelectedTile] = useState<DispatchTileKey>("ready");
    const [dispatchTableSort, setDispatchTableSort] = useState<{
        column: DispatchTableSortCol | null;
        order: "asc" | "desc";
    }>({ column: null, order: "desc" });
    const [expandedDispatchNumber, setExpandedDispatchNumber] = useState<string | null>(null);
    const [expandedDispatchItem, setExpandedDispatchItem] = useState<CargoItem | null>(null);
    const [dispatchTimelineSteps, setDispatchTimelineSteps] = useState<PerevozkaTimelineStep[]>([]);
    const [dispatchTimelineLoading, setDispatchTimelineLoading] = useState(false);
    const [dispatchTimelineError, setDispatchTimelineError] = useState<string | null>(null);
    const [periodQuick, setPeriodQuick] = useState<HaulzPeriodQuick>("неделя");
    const [customDateFrom, setCustomDateFrom] = useState(() => getDateRange("неделя").dateFrom);
    const [customDateTo, setCustomDateTo] = useState(() => getDateRange("неделя").dateTo);
    const [periodModalOpen, setPeriodModalOpen] = useState(false);

    const apiRange = useMemo(() => {
        if (periodQuick === "период") {
            return { dateFrom: customDateFrom, dateTo: customDateTo };
        }
        return getDateRange(periodQuick);
    }, [periodQuick, customDateFrom, customDateTo]);

    const { items: rawItems, error, loading, mutate } = usePerevozki({
        auth,
        dateFrom: apiRange.dateFrom,
        dateTo: apiRange.dateTo,
        useServiceRequest,
        inn: !useServiceRequest ? auth.inn : undefined,
    });

    useEffect(() => {
        if (!useServiceRequest) return;
        const handler = () => void mutate(undefined, { revalidate: true });
        window.addEventListener("haulz-service-refresh", handler);
        return () => window.removeEventListener("haulz-service-refresh", handler);
    }, [useServiceRequest, mutate]);

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
        const arrivedToday: CargoItem[] = [];

        for (const it of items) {
            const k = getFilterKeyByStatus(it.State);
            if (k === "ready") ready.push(it);
            else if (k === "delivering") delivering.push(it);
            else if (k === "in_transit") transit.push(it);
            else if (k === "delivered") delivered.push(it);

            const dk = String(it.DatePrih ?? "").trim().split("T")[0];
            if (dk && dk === todayKey) arrivedToday.push(it);
        }

        return {
            ready,
            delivering,
            transit,
            delivered,
            arrivedToday,
            total: items.length,
        };
    }, [items, todayKey]);

    const listByTile: Record<DispatchTileKey, CargoItem[]> = useMemo(
        () => ({
            ready: sortByArrivalDesc(stats.ready),
            delivering: sortByArrivalDesc(stats.delivering),
            transit: sortByArrivalDesc(stats.transit),
            delivered: sortByArrivalDesc(stats.delivered),
            arrived_today: sortByArrivalDesc(stats.arrivedToday),
            total: sortByArrivalDesc(items),
        }),
        [stats.ready, stats.delivering, stats.transit, stats.delivered, stats.arrivedToday, items],
    );

    useEffect(() => {
        setDispatchTableSort({ column: null, order: "desc" });
        setExpandedDispatchNumber(null);
        setExpandedDispatchItem(null);
    }, [selectedTile]);

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

    const refresh = useCallback(() => {
        void mutate(undefined, { revalidate: true });
        try {
            window.dispatchEvent(new Event("haulz-service-refresh"));
        } catch {
            /* ignore */
        }
    }, [mutate]);

    const modalSeed = useMemo(() => {
        if (periodQuick === "период") return { from: customDateFrom, to: customDateTo };
        return getDateRange(periodQuick);
    }, [periodQuick, customDateFrom, customDateTo]);

    const openPeriodModal = useCallback(() => {
        setPeriodModalOpen(true);
    }, []);

    const StatCard = ({
        tileKey,
        cardTitle,
        count,
        sub,
        accent,
    }: {
        tileKey: DispatchTileKey;
        cardTitle: string;
        count: number;
        sub: string;
        accent: string;
    }) => {
        const selected = selectedTile === tileKey;
        return (
            <Panel
                role="button"
                tabIndex={0}
                className="cargo-card"
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
                }}
            >
                <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>{cardTitle}</Typography.Body>
                <Typography.Headline style={{ fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.2 }}>{count.toLocaleString("ru-RU")}</Typography.Headline>
                <Typography.Body
                    style={{
                        fontSize: "0.62rem",
                        color: "var(--color-text-secondary)",
                        marginTop: "0.2rem",
                        lineHeight: 1.25,
                    }}
                >
                    {sub}
                </Typography.Body>
            </Panel>
        );
    };

    const showHeader = Boolean(title || subtitle || showRefreshButton);

    return (
        <div className="w-full" style={{ maxWidth: "100%", marginBottom: "1rem" }}>
            <CustomPeriodModal
                isOpen={periodModalOpen}
                onClose={() => setPeriodModalOpen(false)}
                dateFrom={modalSeed.from}
                dateTo={modalSeed.to}
                onApply={(from, to) => {
                    setCustomDateFrom(from);
                    setCustomDateTo(to);
                    setPeriodQuick("период");
                    setPeriodModalOpen(false);
                }}
            />

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

            <Flex gap="0.4rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
                {QUICK_FILTERS.map(({ key, label }) => (
                    <Button
                        key={key}
                        type="button"
                        className="filter-button"
                        onClick={() => {
                            setPeriodQuick(key);
                            setPeriodModalOpen(false);
                        }}
                        style={{
                            padding: "0.35rem 0.75rem",
                            fontSize: "0.82rem",
                            background: periodQuick === key ? "var(--color-primary-blue)" : "var(--color-bg-hover)",
                            color: periodQuick === key ? "white" : "var(--color-text-primary)",
                            border: periodQuick === key ? "1px solid var(--color-primary-blue)" : "1px solid var(--color-border)",
                        }}
                    >
                        {label}
                    </Button>
                ))}
                <Button
                    type="button"
                    className="filter-button"
                    onClick={openPeriodModal}
                    style={{
                        padding: "0.35rem 0.75rem",
                        fontSize: "0.82rem",
                        background: periodQuick === "период" ? "var(--color-primary-blue)" : "var(--color-bg-hover)",
                        color: periodQuick === "период" ? "white" : "var(--color-text-primary)",
                        border: periodQuick === "период" ? "1px solid var(--color-primary-blue)" : "1px solid var(--color-border)",
                    }}
                >
                    Период
                </Button>
                <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                    {apiRange.dateFrom} — {apiRange.dateTo}
                </Typography.Body>
            </Flex>

            {loading && rawItems.length === 0 && (
                <Flex justify="center" style={{ padding: "1.5rem" }}>
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--color-primary-blue)" }} />
                </Flex>
            )}

            {error && (
                <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem", borderRadius: 12, border: "1px solid #fecaca", background: "#fef2f2" }}>
                    <Typography.Body style={{ color: "#b91c1c" }}>
                        {typeof error === "string" ? error : String((error as Error)?.message || error)}
                    </Typography.Body>
                </Panel>
            )}

            {!loading && !error && (
                <>
                    <Flex gap="0.55rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
                        <StatCard
                            tileKey="ready"
                            cardTitle="Готов к выдаче"
                            count={stats.ready.length}
                            sub={tilePwVolCaption(stats.ready)}
                            accent="#8b5cf6"
                        />
                        <StatCard
                            tileKey="delivering"
                            cardTitle="На доставке"
                            count={stats.delivering.length}
                            sub={tilePwVolCaption(stats.delivering)}
                            accent="#06b6d4"
                        />
                        <StatCard
                            tileKey="transit"
                            cardTitle="В пути"
                            count={stats.transit.length}
                            sub={tilePwVolCaption(stats.transit)}
                            accent="#f59e0b"
                        />
                        <StatCard
                            tileKey="delivered"
                            cardTitle="Доставлено"
                            count={stats.delivered.length}
                            sub={tilePwVolCaption(stats.delivered)}
                            accent="#10b981"
                        />
                        <StatCard
                            tileKey="arrived_today"
                            cardTitle="Прибыло сегодня"
                            count={stats.arrivedToday.length}
                            sub={tilePwVolCaption(stats.arrivedToday)}
                            accent="#6366f1"
                        />
                        <StatCard tileKey="total" cardTitle="Всего в выборке" count={stats.total} sub={tilePwVolCaption(items)} accent="#64748b" />
                    </Flex>

                    <Panel className="cargo-card" style={{ padding: "1rem 1.1rem", borderRadius: 12, background: "var(--color-bg-card)" }}>
                        <Typography.Headline style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                            {QUEUE_TITLE[selectedTile]}
                        </Typography.Headline>
                        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.65rem" }}>
                            Нажмите на строку — раскроются статусы перевозки (как в мониторе SLA). Карточку можно открыть кнопкой под таблицей статусов.
                        </Typography.Body>
                        {tableRows.length === 0 ? (
                            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет перевозок в этом разделе за период.</Typography.Body>
                        ) : (
                            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                    <thead>
                                        <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                                            {(
                                                [
                                                    { col: "number" as const, label: "№", align: "left" as const },
                                                    { col: "customer" as const, label: "Заказчик", align: "left" as const },
                                                    { col: "statusDate" as const, label: "Дата статуса", align: "left" as const },
                                                    { col: "datePrih" as const, label: "Приход", align: "left" as const },
                                                    { col: "pw" as const, label: "Плат. вес", align: "right" as const },
                                                    { col: "sum" as const, label: "Сумма", align: "right" as const },
                                                ] as const
                                            ).map(({ col, label, align }) => {
                                                const active = dispatchTableSort.column === col;
                                                const SortIcon = dispatchTableSort.order === "asc" ? ArrowUp : ArrowDown;
                                                return (
                                                    <th
                                                        key={col}
                                                        role="columnheader"
                                                        aria-sort={
                                                            !active ? "none" : dispatchTableSort.order === "asc" ? "ascending" : "descending"
                                                        }
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onDispatchSortHeaderClick(col);
                                                        }}
                                                        title="Сортировка по столбцу"
                                                        style={{
                                                            padding: "0.4rem 0.35rem",
                                                            fontWeight: 600,
                                                            textAlign: align,
                                                            cursor: "pointer",
                                                            userSelect: "none",
                                                            whiteSpace: "nowrap",
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
                                        {tableRows.map((row, ridx) => {
                                            const num = String(row.Number ?? "").trim();
                                            const cust = stripOoo(String(row.Customer ?? (row as { customer?: string }).customer ?? "—"));
                                            const statusDateCell = formatDispatchFilterDateCell(row);
                                            const dp = String(row.DatePrih ?? "").trim().split("T")[0];
                                            const pw = typeof row.PW === "string" ? parseFloat(row.PW) || 0 : Number(row.PW) || 0;
                                            const sum = typeof row.Sum === "string" ? parseFloat(row.Sum) || 0 : Number(row.Sum) || 0;
                                            const slaLate = rowIsOutsideSla(row, workScheduleByInn);
                                            const expanded = !!num && expandedDispatchNumber === num;
                                            const rowBg = expanded
                                                ? "var(--color-bg-hover)"
                                                : slaLate
                                                  ? "rgba(254, 226, 226, 0.85)"
                                                  : undefined;
                                            return (
                                                <React.Fragment key={num ? `${selectedTile}-${num}` : `${selectedTile}-i-${ridx}`}>
                                                    <tr
                                                        onClick={() => {
                                                            if (!num) return;
                                                            if (expandedDispatchNumber === num) {
                                                                setExpandedDispatchNumber(null);
                                                                setExpandedDispatchItem(null);
                                                            } else {
                                                                setExpandedDispatchNumber(num);
                                                                setExpandedDispatchItem(row);
                                                            }
                                                        }}
                                                        style={{
                                                            borderBottom: "1px solid var(--color-border)",
                                                            cursor: num ? "pointer" : "default",
                                                            background: rowBg,
                                                        }}
                                                        title={num ? (expanded ? "Свернуть статусы" : "Показать статусы перевозки") : undefined}
                                                    >
                                                        <td style={{ padding: "0.35rem", whiteSpace: "nowrap" }}>{formatInvoiceNumber(num)}</td>
                                                        <td style={{ padding: "0.35rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cust}>
                                                            {cust}
                                                        </td>
                                                        <td style={{ padding: "0.35rem", fontSize: "0.72rem", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                                                            {statusDateCell}
                                                        </td>
                                                        <td style={{ padding: "0.35rem", whiteSpace: "nowrap" }}>{dp || "—"}</td>
                                                        <td style={{ padding: "0.35rem", textAlign: "right" }}>{Math.round(pw).toLocaleString("ru-RU")}</td>
                                                        <td style={{ padding: "0.35rem", textAlign: "right" }}>{formatCurrency(sum, true)}</td>
                                                    </tr>
                                                    {expanded && expandedDispatchItem && (
                                                        <tr>
                                                            <td
                                                                colSpan={6}
                                                                style={{
                                                                    padding: "0.5rem",
                                                                    borderBottom: "1px solid var(--color-border)",
                                                                    verticalAlign: "top",
                                                                    background: "var(--color-bg-primary)",
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <Typography.Body style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                                                                    Статусы перевозки
                                                                </Typography.Body>
                                                                {dispatchTimelineLoading && (
                                                                    <Flex align="center" gap="0.5rem" style={{ padding: "0.35rem 0" }}>
                                                                        <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--color-primary-blue)" }} />
                                                                        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                                                                            Загрузка…
                                                                        </Typography.Body>
                                                                    </Flex>
                                                                )}
                                                                {dispatchTimelineError && (
                                                                    <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                                                                        {dispatchTimelineError}
                                                                    </Typography.Body>
                                                                )}
                                                                {!dispatchTimelineLoading &&
                                                                    dispatchTimelineSteps &&
                                                                    dispatchTimelineSteps.length > 0 &&
                                                                    (() => {
                                                                        const item = expandedDispatchItem;
                                                                        const planEndMs =
                                                                            item?.DatePrih
                                                                                ? new Date(item.DatePrih).getTime() +
                                                                                  getPlanDays(item) * 24 * 60 * 60 * 1000
                                                                                : 0;
                                                                        return (
                                                                            <table
                                                                                style={{
                                                                                    width: "100%",
                                                                                    borderCollapse: "collapse",
                                                                                    fontSize: "0.8rem",
                                                                                }}
                                                                            >
                                                                                <thead>
                                                                                    <tr
                                                                                        style={{
                                                                                            borderBottom: "1px solid var(--color-border)",
                                                                                            background: "var(--color-bg-hover)",
                                                                                        }}
                                                                                    >
                                                                                        <th style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}>
                                                                                            Статус
                                                                                        </th>
                                                                                        <th style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}>
                                                                                            Дата доставки
                                                                                        </th>
                                                                                        <th style={{ padding: "0.35rem 0.3rem", textAlign: "left", fontWeight: 600 }}>
                                                                                            Время доставки
                                                                                        </th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {dispatchTimelineSteps.map((step, i) => {
                                                                                        const stepMs = step.date ? new Date(step.date).getTime() : 0;
                                                                                        const outOfSlaFromThisStep =
                                                                                            planEndMs > 0 && stepMs > planEndMs;
                                                                                        const dateColor = outOfSlaFromThisStep
                                                                                            ? "#ef4444"
                                                                                            : planEndMs > 0 && stepMs > 0
                                                                                              ? "#22c55e"
                                                                                              : "var(--color-text-secondary)";
                                                                                        return (
                                                                                            <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                                                                                <td
                                                                                                    style={{
                                                                                                        padding: "0.35rem 0.3rem",
                                                                                                        color: outOfSlaFromThisStep ? "#ef4444" : undefined,
                                                                                                    }}
                                                                                                >
                                                                                                    {step.label}
                                                                                                </td>
                                                                                                <td style={{ padding: "0.35rem 0.3rem", color: dateColor }}>
                                                                                                    {formatTimelineDate(step.date)}
                                                                                                </td>
                                                                                                <td style={{ padding: "0.35rem 0.3rem", color: dateColor }}>
                                                                                                    {formatTimelineTime(step.date)}
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        );
                                                                    })()}
                                                                {!dispatchTimelineLoading &&
                                                                    dispatchTimelineSteps &&
                                                                    dispatchTimelineSteps.length === 0 &&
                                                                    !dispatchTimelineError && (
                                                                        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                                                                            Нет шагов статуса.
                                                                        </Typography.Body>
                                                                    )}
                                                                <div style={{ marginTop: "0.45rem" }}>
                                                                    <Button
                                                                        type="button"
                                                                        className="filter-button"
                                                                        style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onOpenCargo(num);
                                                                        }}
                                                                    >
                                                                        Открыть карточку перевозки
                                                                    </Button>
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
                    </Panel>
                </>
            )}
        </div>
    );
}
