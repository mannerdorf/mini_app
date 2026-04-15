/**
 * Сводка по выдаче грузов: период (сегодня / вчера / 7 дней / 30 дней / произвольный), плитки и таблица.
 * Блок на главном дашборде (при праве haulz).
 */
import React, { useMemo, useCallback, useState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { AuthData, CargoItem, DateFilter } from "../types";
import { getDateRange, getTodayDate, parseDateOnly } from "../lib/dateUtils";
import { getFilterKeyByStatus, isReceivedInfoStatus, normalizeStatus } from "../lib/statusUtils";
import { formatCurrency, formatInvoiceNumber, stripOoo } from "../lib/formatUtils";
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

const QUEUE_TITLE: Record<DispatchTileKey, string> = {
    ready: "Очередь «Готов к выдаче»",
    delivering: "Перевозки «На доставке»",
    transit: "Перевозки «В пути»",
    delivered: "Перевозки «Доставлено»",
    arrived_today: "Перевозки «Прибыло сегодня»",
    total: "Все перевозки в выборке",
};

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

function countMest(items: CargoItem[]): number {
    return items.reduce((acc, it) => {
        const v = typeof it.Mest === "string" ? parseFloat(it.Mest) || 0 : Number(it.Mest) || 0;
        return acc + v;
    }, 0);
}

function sortByArrivalDesc(list: CargoItem[]): CargoItem[] {
    return [...list].sort((a, b) => {
        const ta = parseDateOnly(String(a.DatePrih ?? ""))?.getTime() ?? 0;
        const tb = parseDateOnly(String(b.DatePrih ?? ""))?.getTime() ?? 0;
        return tb - ta;
    });
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
    const [selectedTile, setSelectedTile] = useState<DispatchTileKey>("ready");
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

    const tableRows = useMemo(() => listByTile[selectedTile].slice(0, TABLE_MAX_ROWS), [listByTile, selectedTile]);

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
                <Typography.Body style={{ fontSize: "0.68rem", color: "var(--color-text-secondary)", marginTop: "0.2rem" }}>{sub}</Typography.Body>
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
                            sub={`${Math.round(sumPw(stats.ready)).toLocaleString("ru-RU")} кг · ${countMest(stats.ready)} мест`}
                            accent="#8b5cf6"
                        />
                        <StatCard
                            tileKey="delivering"
                            cardTitle="На доставке"
                            count={stats.delivering.length}
                            sub={`${Math.round(sumPw(stats.delivering)).toLocaleString("ru-RU")} кг`}
                            accent="#06b6d4"
                        />
                        <StatCard
                            tileKey="transit"
                            cardTitle="В пути"
                            count={stats.transit.length}
                            sub={`${Math.round(sumPw(stats.transit)).toLocaleString("ru-RU")} кг`}
                            accent="#f59e0b"
                        />
                        <StatCard
                            tileKey="delivered"
                            cardTitle="Доставлено"
                            count={stats.delivered.length}
                            sub="за выбранный период"
                            accent="#10b981"
                        />
                        <StatCard
                            tileKey="arrived_today"
                            cardTitle="Прибыло сегодня"
                            count={stats.arrivedToday.length}
                            sub="по дате прихода"
                            accent="#6366f1"
                        />
                        <StatCard tileKey="total" cardTitle="Всего в выборке" count={stats.total} sub="перевозок" accent="#64748b" />
                    </Flex>

                    <Panel className="cargo-card" style={{ padding: "1rem 1.1rem", borderRadius: 12, background: "var(--color-bg-card)" }}>
                        <Typography.Headline style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                            {QUEUE_TITLE[selectedTile]}
                        </Typography.Headline>
                        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.65rem" }}>
                            Нажмите на строку — откроется карточка перевозки.
                        </Typography.Body>
                        {tableRows.length === 0 ? (
                            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет перевозок в этом разделе за период.</Typography.Body>
                        ) : (
                            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                    <thead>
                                        <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 600 }}>№</th>
                                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 600 }}>Заказчик</th>
                                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 600 }}>Статус</th>
                                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 600 }}>Приход</th>
                                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 600, textAlign: "right" }}>Плат. вес</th>
                                            <th style={{ padding: "0.4rem 0.35rem", fontWeight: 600, textAlign: "right" }}>Сумма</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tableRows.map((row, ridx) => {
                                            const num = String(row.Number ?? "").trim();
                                            const cust = stripOoo(String(row.Customer ?? (row as { customer?: string }).customer ?? "—"));
                                            const st = normalizeStatus(row.State);
                                            const dp = String(row.DatePrih ?? "").trim().split("T")[0];
                                            const pw = typeof row.PW === "string" ? parseFloat(row.PW) || 0 : Number(row.PW) || 0;
                                            const sum = typeof row.Sum === "string" ? parseFloat(row.Sum) || 0 : Number(row.Sum) || 0;
                                            return (
                                                <tr
                                                    key={num ? `${selectedTile}-${num}` : `${selectedTile}-i-${ridx}`}
                                                    onClick={() => num && onOpenCargo(num)}
                                                    style={{
                                                        borderBottom: "1px solid var(--color-border)",
                                                        cursor: num ? "pointer" : "default",
                                                    }}
                                                    title={num ? "Открыть перевозку" : undefined}
                                                >
                                                    <td style={{ padding: "0.35rem", whiteSpace: "nowrap" }}>{formatInvoiceNumber(num)}</td>
                                                    <td style={{ padding: "0.35rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cust}>
                                                        {cust}
                                                    </td>
                                                    <td style={{ padding: "0.35rem", fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>{st}</td>
                                                    <td style={{ padding: "0.35rem", whiteSpace: "nowrap" }}>{dp || "—"}</td>
                                                    <td style={{ padding: "0.35rem", textAlign: "right" }}>{Math.round(pw).toLocaleString("ru-RU")}</td>
                                                    <td style={{ padding: "0.35rem", textAlign: "right" }}>{formatCurrency(sum, true)}</td>
                                                </tr>
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
