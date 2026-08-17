import React, { useEffect, useMemo, useState } from "react";
import {
    Loader2, TrendingUp, TrendingDown, ArrowDown, ArrowUp,
} from "lucide-react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { normalizeStatus } from "../../../lib/statusUtils";
import { getSlaInfo, getSlaPlanDeadlineMs } from "../../../lib/cargoUtils";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { ClickableCargoNumber, leafRowClickProps } from "../../../components/ui/EntityLinks";
import { DateText } from "../../../components/ui/DateText";
import { fetchPerevozkaTimeline } from "../../../lib/perevozkaDetails";
import * as dateUtils from "../../../lib/dateUtils";
import { DashboardChartBarH } from "../dashboardChartBars";
import type { AuthData, CargoItem, PerevozkaTimelineStep } from "../../../types";

const { formatTimelineDate, formatTimelineTime } = dateUtils;

export type DashboardSlaStats = {
    total: number;
    onTime: number;
    percentOnTime: number;
    avgDelay: number;
    minDays: number;
    maxDays: number;
    avgDays: number;
};

export type DashboardSlaStatsByType = {
    auto: { total: number; onTime: number; percentOnTime: number; avgDelay: number };
    ferry: { total: number; onTime: number; percentOnTime: number; avgDelay: number };
    air: { total: number; onTime: number; percentOnTime: number; avgDelay: number };
};

export type DashboardSlaOutOfSlaRow = {
    item: CargoItem;
    sla: NonNullable<ReturnType<typeof getSlaInfo>>;
};

export type DashboardSlaMonitorProps = {
    auth: AuthData;
    useServiceRequest: boolean;
    chartBarFillEnabled: boolean;
    slaStats: DashboardSlaStats;
    slaStatsByType: DashboardSlaStatsByType;
    slaTrend: 'up' | 'down' | null;
    outOfSlaByType: { auto: DashboardSlaOutOfSlaRow[]; ferry: DashboardSlaOutOfSlaRow[]; air: DashboardSlaOutOfSlaRow[] };
    onOpenCargo?: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
    normalizeTimelineErrorMessage: (message?: string | null) => string;
};

function sortOutOfSlaRows(
    rows: DashboardSlaOutOfSlaRow[],
    sortColumn: string | null,
    sortOrder: 'asc' | 'desc',
): DashboardSlaOutOfSlaRow[] {
    if (!sortColumn) return rows;
    const order = sortOrder === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        let va: string | number;
        let vb: string | number;
        switch (sortColumn) {
            case 'number': va = (a.item.Number ?? ''); vb = (b.item.Number ?? ''); break;
            case 'date': va = new Date(a.item.DatePrih || 0).getTime(); vb = new Date(b.item.DatePrih || 0).getTime(); break;
            case 'status': va = normalizeStatus(a.item.State) || ''; vb = normalizeStatus(b.item.State) || ''; break;
            case 'customer': va = stripOoo((a.item.Customer ?? (a.item as any).customer) ?? ''); vb = stripOoo((b.item.Customer ?? (b.item as any).customer) ?? ''); break;
            case 'mest': va = Number(a.item.Mest) || 0; vb = Number(b.item.Mest) || 0; break;
            case 'pw': va = Number(a.item.PW) || 0; vb = Number(b.item.PW) || 0; break;
            case 'sum': va = Number(a.item.Sum) || 0; vb = Number(b.item.Sum) || 0; break;
            case 'days': va = a.sla.actualDays; vb = b.sla.actualDays; break;
            case 'plan': va = a.sla.planDays; vb = b.sla.planDays; break;
            case 'delay': va = a.sla.delayDays; vb = b.sla.delayDays; break;
            default: return 0;
        }
        const cmp = typeof va === 'string' && typeof vb === 'string'
            ? va.localeCompare(vb)
            : (va < vb ? -1 : va > vb ? 1 : 0);
        return cmp * order;
    });
}

function SlaSortHeader({
    column,
    label,
    sortColumn,
    sortOrder,
    onSort,
}: {
    column: string;
    label: string;
    sortColumn: string | null;
    sortOrder: 'asc' | 'desc';
    onSort: (column: string) => void;
}) {
    return (
        <th
            style={{ padding: '0.35rem 0.3rem', textAlign: label.includes('Мест') || label.includes('Плат') || label.includes('Сумма') || label.includes('Дней') || label.includes('План') || label.includes('Просрочка') ? 'right' : 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
            onClick={(e) => { e.stopPropagation(); onSort(column); }}
            title="Сортировка"
        >
            {label}
            {sortColumn === column && (sortOrder === 'asc'
                ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />
                : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}
        </th>
    );
}

export function DashboardSlaMonitor({
    auth,
    useServiceRequest,
    chartBarFillEnabled,
    slaStats,
    slaStatsByType,
    slaTrend,
    outOfSlaByType,
    onOpenCargo,
    normalizeTimelineErrorMessage,
}: DashboardSlaMonitorProps) {
    const [slaDetailsOpen, setSlaDetailsOpen] = useState(false);
    const [expandedSlaCargoNumber, setExpandedSlaCargoNumber] = useState<string | null>(null);
    const [expandedSlaItem, setExpandedSlaItem] = useState<CargoItem | null>(null);
    const [slaTimelineSteps, setSlaTimelineSteps] = useState<PerevozkaTimelineStep[] | null>(null);
    const [slaTimelineLoading, setSlaTimelineLoading] = useState(false);
    const [slaTimelineError, setSlaTimelineError] = useState<string | null>(null);
    const [slaTableSortColumn, setSlaTableSortColumn] = useState<string | null>(null);
    const [slaTableSortOrder, setSlaTableSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleSlaTableSort = (column: string) => {
        if (slaTableSortColumn === column) {
            setSlaTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setSlaTableSortColumn(column);
            setSlaTableSortOrder('asc');
        }
    };

    const sortedOutOfSlaAuto = useMemo(
        () => sortOutOfSlaRows(outOfSlaByType.auto, slaTableSortColumn, slaTableSortOrder),
        [outOfSlaByType.auto, slaTableSortColumn, slaTableSortOrder],
    );
    const sortedOutOfSlaFerry = useMemo(
        () => sortOutOfSlaRows(outOfSlaByType.ferry, slaTableSortColumn, slaTableSortOrder),
        [outOfSlaByType.ferry, slaTableSortColumn, slaTableSortOrder],
    );
    const sortedOutOfSlaAir = useMemo(
        () => sortOutOfSlaRows(outOfSlaByType.air, slaTableSortColumn, slaTableSortOrder),
        [outOfSlaByType.air, slaTableSortColumn, slaTableSortOrder],
    );

    useEffect(() => {
        if (!expandedSlaCargoNumber || !expandedSlaItem || !auth?.login || !auth?.password) {
            setSlaTimelineSteps(null);
            setSlaTimelineError(null);
            return;
        }
        let cancelled = false;
        setSlaTimelineLoading(true);
        setSlaTimelineError(null);
        fetchPerevozkaTimeline(auth, expandedSlaCargoNumber, expandedSlaItem, { forceServiceAuth: true })
            .then((steps) => { if (!cancelled) setSlaTimelineSteps(steps); })
            .catch((e: any) => { if (!cancelled) setSlaTimelineError(normalizeTimelineErrorMessage(e?.message)); })
            .finally(() => { if (!cancelled) setSlaTimelineLoading(false); });
        return () => { cancelled = true; };
    }, [expandedSlaCargoNumber, expandedSlaItem, auth?.login, auth?.password, normalizeTimelineErrorMessage]);

    return (
        <Panel className="cargo-card sla-monitor-panel" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.5rem' }}>
            <Flex align="center" justify="space-between" className="sla-monitor-header" style={{ marginBottom: '0.2rem' }}>
                <Typography.Headline style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                    монитор срока доставки
                </Typography.Headline>
                {slaStats.total > 0 && slaTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} title="Динамика SLA улучшается" />}
                {slaStats.total > 0 && slaTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} title="Динамика SLA ухудшается" />}
            </Flex>
            <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                Контроль сроков доставки: % выполнения SLA, средний срок и детали по перевозкам вне норматива.
            </Typography.Body>
            {slaStats.total === 0 ? (
                <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Нет перевозок за выбранный период.</Typography.Body>
            ) : (
            <>
            <Flex gap="2rem" wrap="wrap" align="flex-start" className="sla-monitor-metrics" style={{ marginBottom: '1rem' }}>
                <div style={{ minWidth: 0 }}>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>В срок{'   '}</Typography.Body>
                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: slaStats.percentOnTime >= 90 ? 'var(--color-success-status)' : slaStats.percentOnTime >= 70 ? '#f59e0b' : '#ef4444', display: 'inline' }}>
                        {slaStats.percentOnTime}%
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'inline' }}>{'   '}{slaStats.onTime} из {slaStats.total} перевозок</Typography.Body>
                </div>
                <div style={{ minWidth: 0 }}>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Средняя просрочка{'   '}</Typography.Body>
                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: slaStats.avgDelay > 0 ? '#ef4444' : 'var(--color-text-primary)', display: 'inline' }}>
                        {slaStats.avgDelay} дн.
                    </Typography.Body>
                </div>
                {useServiceRequest && (
                    <>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Мин. дней доставки{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                {slaStats.minDays} дн.
                            </Typography.Body>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Макс. дней доставки{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                {slaStats.maxDays} дн.
                            </Typography.Body>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Среднее дней доставки{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                {slaStats.avgDays} дн.
                            </Typography.Body>
                        </div>
                    </>
                )}
            </Flex>
            <div
                className="sla-monitor-details-toggle"
                role="button"
                tabIndex={0}
                onClick={() => setSlaDetailsOpen(!slaDetailsOpen)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSlaDetailsOpen(!slaDetailsOpen); } }}
                style={{ cursor: 'pointer', marginBottom: slaDetailsOpen ? '0.75rem' : 0 }}
                title={slaDetailsOpen ? 'Свернуть' : 'Подробности по типу перевозки'}
            >
                <div style={{ height: 12, borderRadius: 6, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                    <DashboardChartBarH
                        enabled={chartBarFillEnabled}
                        widthPercent={slaStats.percentOnTime}
                        delay={0.08}
                        style={{
                            borderRadius: 6,
                            background: `linear-gradient(90deg, var(--color-success-status) 0%, #f59e0b 50%, #ef4444 100%)`,
                        }}
                    />
                </div>
                <Typography.Body style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                    {slaDetailsOpen ? '▼ Подробности' : '▶ Нажмите для разбивки по типу перевозки'}
                </Typography.Body>
            </div>
            {slaDetailsOpen && (
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Авто{'   '}</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                            {slaStatsByType.auto.percentOnTime}% ({slaStatsByType.auto.onTime}/{slaStatsByType.auto.total}), ср. {slaStatsByType.auto.avgDelay} дн.
                        </Typography.Body>
                        {outOfSlaByType.auto.length > 0 && (
                            <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                            <SlaSortHeader column="number" label="Номер" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="date" label="Дата прихода" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="status" label="Статус" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <th className="customer-col" style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                            <SlaSortHeader column="mest" label="Мест" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="pw" label="Плат. вес" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="sum" label="Сумма" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="days" label="Дней" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="plan" label="План" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="delay" label="Просрочка" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedOutOfSlaAuto.map(({ item, sla }, idx) => (
                                            <React.Fragment key={`auto-${item.Number ?? idx}`}>
                                                <tr
                                                    style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedSlaCargoNumber === (item.Number ?? '') ? 'var(--color-bg-hover)' : undefined }}
                                                    onClick={() => {
                                                        const num = item.Number ?? '';
                                                        if (expandedSlaCargoNumber === num) {
                                                            setExpandedSlaCargoNumber(null);
                                                            setExpandedSlaItem(null);
                                                        } else {
                                                            setExpandedSlaCargoNumber(num);
                                                            setExpandedSlaItem(item);
                                                        }
                                                    }}
                                                    title={expandedSlaCargoNumber === (item.Number ?? '') ? 'Свернуть статусы' : 'Показать статусы перевозки'}
                                                >
                                                    <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>
                                                        <ClickableCargoNumber number={item.Number ? String(item.Number) : ''} onOpen={(n) => onOpenCargo?.(n, item)} style={{ color: '#ef4444' }} />
                                                    </td>
                                                    <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                    <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                    <td className="customer-col" style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                                </tr>
                                                {expandedSlaCargoNumber === (item.Number ?? '') && (
                                                    <tr>
                                                        <td colSpan={10} style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                            <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>Статусы перевозки</Typography.Body>
                                                            {slaTimelineLoading && (
                                                                <Flex align="center" gap="0.5rem" style={{ padding: '0.35rem 0' }}>
                                                                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Загрузка…</Typography.Body>
                                                                </Flex>
                                                            )}
                                                            {slaTimelineError && (
                                                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{slaTimelineError}</Typography.Body>
                                                            )}
                                                            {!slaTimelineLoading && slaTimelineSteps && slaTimelineSteps.length > 0 && (() => {
                                                                const planEndMs = getSlaPlanDeadlineMs(item);
                                                                return (
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                    <thead>
                                                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата доставки</th>
                                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Время доставки</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {slaTimelineSteps.map((step, i) => {
                                                                            const stepMs = step.date ? new Date(step.date).getTime() : 0;
                                                                            const outOfSlaFromThisStep = planEndMs > 0 && stepMs > planEndMs;
                                                                            const dateColor = outOfSlaFromThisStep ? '#ef4444' : (planEndMs > 0 && stepMs > 0 ? '#22c55e' : 'var(--color-text-secondary)');
                                                                            const cargoNum = item.Number ? String(item.Number) : '';
                                                                            const stepRowOpen = cargoNum && onOpenCargo
                                                                                ? leafRowClickProps(() => onOpenCargo(cargoNum, item), 'Открыть карточку перевозки')
                                                                                : null;
                                                                            return (
                                                                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', ...(stepRowOpen?.style ?? {}) }} onClick={stepRowOpen?.onClick} title={stepRowOpen?.title}>
                                                                                <td style={{ padding: '0.35rem 0.3rem', color: outOfSlaFromThisStep ? '#ef4444' : undefined }}>{step.label}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', color: dateColor }}>{formatTimelineDate(step.date)}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', color: dateColor }}>{formatTimelineTime(step.date)}</td>
                                                                            </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                                );
                                                            })()}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <div>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Паром{'   '}</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                            {slaStatsByType.ferry.percentOnTime}% ({slaStatsByType.ferry.onTime}/{slaStatsByType.ferry.total}), ср. {slaStatsByType.ferry.avgDelay} дн.
                        </Typography.Body>
                        {outOfSlaByType.ferry.length > 0 && (
                            <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                            <SlaSortHeader column="number" label="Номер" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="date" label="Дата прихода" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="status" label="Статус" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <th className="customer-col" style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                            <SlaSortHeader column="mest" label="Мест" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="pw" label="Плат. вес" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="sum" label="Сумма" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="days" label="Дней" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="plan" label="План" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="delay" label="Просрочка" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedOutOfSlaFerry.map(({ item, sla }, idx) => (
                                            <tr key={`ferry-${item.Number ?? idx}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>{item.Number ?? '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                <td className="customer-col" style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: '0.75rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Авиа{'   '}</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                            {slaStatsByType.air.percentOnTime}% ({slaStatsByType.air.onTime}/{slaStatsByType.air.total}), ср. {slaStatsByType.air.avgDelay} дн.
                        </Typography.Body>
                        {outOfSlaByType.air.length > 0 && (
                            <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                            <SlaSortHeader column="number" label="Номер" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="date" label="Дата прихода" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="status" label="Статус" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <th className="customer-col" style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                            <SlaSortHeader column="mest" label="Мест" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="pw" label="Плат. вес" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="sum" label="Сумма" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="days" label="Дней" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="plan" label="План" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                            <SlaSortHeader column="delay" label="Просрочка" sortColumn={slaTableSortColumn} sortOrder={slaTableSortOrder} onSort={handleSlaTableSort} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedOutOfSlaAir.map(({ item, sla }, idx) => (
                                            <tr key={`air-${item.Number ?? idx}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>{item.Number ?? '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                <td className="customer-col" style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
            </>
            )}
        </Panel>
    );
}
