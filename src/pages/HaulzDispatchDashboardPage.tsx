/**
 * Дашборд выдачи грузов: служебная сводка по статусам (для аккаунтов с правом haulz).
 */
import React, { useMemo, useState, useCallback } from "react";
import { Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { AuthData, CargoItem, DateFilter } from "../types";
import { usePerevozki } from "../hooks/useApi";
import { getDateRange, getTodayDate, parseDateOnly } from "../lib/dateUtils";
import { getFilterKeyByStatus, normalizeStatus } from "../lib/statusUtils";
import { formatCurrency, formatInvoiceNumber, stripOoo } from "../lib/formatUtils";

type Props = {
    auth: AuthData;
    onBack: () => void;
    onOpenCargo: (cargoNumber: string) => void;
};

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

export function HaulzDispatchDashboardPage({ auth, onBack, onOpenCargo }: Props) {
    const [dateFilter, setDateFilter] = useState<DateFilter>("неделя");
    const apiRange = useMemo(() => getDateRange(dateFilter), [dateFilter]);

    const { items, error, loading, mutate } = usePerevozki({
        auth,
        dateFrom: apiRange.dateFrom,
        dateTo: apiRange.dateTo,
        useServiceRequest: true,
    });

    const refresh = useCallback(() => {
        void mutate(undefined, { revalidate: true });
        try {
            window.dispatchEvent(new Event("haulz-service-refresh"));
        } catch {
            /* ignore */
        }
    }, [mutate]);

    const todayKey = getTodayDate();

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

    const readyTop = useMemo(() => {
        const sorted = [...stats.ready].sort((a, b) => {
            const ta = parseDateOnly(String(a.DatePrih ?? ""))?.getTime() ?? 0;
            const tb = parseDateOnly(String(b.DatePrih ?? ""))?.getTime() ?? 0;
            return tb - ta;
        });
        return sorted.slice(0, 40);
    }, [stats.ready]);

    const StatCard = ({
        title,
        count,
        sub,
        accent,
    }: {
        title: string;
        count: number;
        sub: string;
        accent: string;
    }) => (
        <Panel
            className="cargo-card"
            style={{
                flex: "1 1 140px",
                minWidth: 140,
                padding: "0.85rem 1rem",
                borderRadius: 12,
                borderLeft: `4px solid ${accent}`,
                background: "var(--color-bg-card)",
            }}
        >
            <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>{title}</Typography.Body>
            <Typography.Headline style={{ fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.2 }}>{count.toLocaleString("ru-RU")}</Typography.Headline>
            <Typography.Body style={{ fontSize: "0.68rem", color: "var(--color-text-secondary)", marginTop: "0.2rem" }}>{sub}</Typography.Body>
        </Panel>
    );

    return (
        <div className="w-full" style={{ maxWidth: "100%", paddingBottom: "1rem" }}>
            <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "1rem" }}>
                <Flex align="center" gap="0.75rem">
                    <Button className="filter-button" type="button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <Typography.Headline style={{ fontSize: "1.2rem", fontWeight: 600 }}>Выдача грузов</Typography.Headline>
                        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                            Сводка по перевозкам в служебном режиме за период
                        </Typography.Body>
                    </div>
                </Flex>
                <Button type="button" className="filter-button" onClick={() => refresh()} disabled={loading} title="Обновить данные">
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
            </Flex>

            <Flex gap="0.4rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
                {(["сегодня", "неделя", "месяц"] as const).map((f) => (
                    <Button
                        key={f}
                        type="button"
                        className="filter-button"
                        onClick={() => setDateFilter(f)}
                        style={{
                            padding: "0.35rem 0.75rem",
                            fontSize: "0.82rem",
                            background: dateFilter === f ? "var(--color-primary-blue)" : "var(--color-bg-hover)",
                            color: dateFilter === f ? "white" : "var(--color-text-primary)",
                            border: dateFilter === f ? "1px solid var(--color-primary-blue)" : "1px solid var(--color-border)",
                        }}
                    >
                        {f === "сегодня" ? "Сегодня" : f === "неделя" ? "7 дней" : "30 дней"}
                    </Button>
                ))}
                <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                    {apiRange.dateFrom} — {apiRange.dateTo}
                </Typography.Body>
            </Flex>

            {loading && items.length === 0 && (
                <Flex justify="center" style={{ padding: "2rem" }}>
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--color-primary-blue)" }} />
                </Flex>
            )}

            {error && (
                <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem", borderRadius: 12, border: "1px solid #fecaca", background: "#fef2f2" }}>
                    <Typography.Body style={{ color: "#b91c1c" }}>{String(error?.message || error)}</Typography.Body>
                </Panel>
            )}

            {!loading && !error && (
                <>
                    <Flex gap="0.55rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
                        <StatCard
                            title="Готов к выдаче"
                            count={stats.ready.length}
                            sub={`${Math.round(sumPw(stats.ready)).toLocaleString("ru-RU")} кг · ${countMest(stats.ready)} мест`}
                            accent="#8b5cf6"
                        />
                        <StatCard
                            title="На доставке"
                            count={stats.delivering.length}
                            sub={`${Math.round(sumPw(stats.delivering)).toLocaleString("ru-RU")} кг`}
                            accent="#06b6d4"
                        />
                        <StatCard
                            title="В пути"
                            count={stats.transit.length}
                            sub={`${Math.round(sumPw(stats.transit)).toLocaleString("ru-RU")} кг`}
                            accent="#f59e0b"
                        />
                        <StatCard
                            title="Доставлено"
                            count={stats.delivered.length}
                            sub="за выбранный период"
                            accent="#10b981"
                        />
                        <StatCard
                            title="Прибыло сегодня"
                            count={stats.arrivedToday.length}
                            sub="по дате прихода"
                            accent="#6366f1"
                        />
                        <StatCard title="Всего в выборке" count={stats.total} sub="перевозок" accent="#64748b" />
                    </Flex>

                    <Panel className="cargo-card" style={{ padding: "1rem 1.1rem", borderRadius: 12, background: "var(--color-bg-card)" }}>
                        <Typography.Headline style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                            Очередь «Готов к выдаче»
                        </Typography.Headline>
                        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "0.65rem" }}>
                            Нажмите на строку — откроется карточка перевозки.
                        </Typography.Body>
                        {readyTop.length === 0 ? (
                            <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Нет перевозок в этом статусе за период.</Typography.Body>
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
                                        {readyTop.map((row, ridx) => {
                                            const num = String(row.Number ?? "").trim();
                                            const cust = stripOoo(String(row.Customer ?? (row as { customer?: string }).customer ?? "—"));
                                            const st = normalizeStatus(row.State);
                                            const dp = String(row.DatePrih ?? "").trim().split("T")[0];
                                            const pw = typeof row.PW === "string" ? parseFloat(row.PW) || 0 : Number(row.PW) || 0;
                                            const sum = typeof row.Sum === "string" ? parseFloat(row.Sum) || 0 : Number(row.Sum) || 0;
                                            return (
                                                <tr
                                                    key={num ? `rd-${num}` : `rd-i-${ridx}`}
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
