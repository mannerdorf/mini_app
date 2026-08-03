import React from "react";
import {
    Loader2, Package, Scale, Weight, List, TrendingUp, TrendingDown, Minus, RussianRuble,
} from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { formatCurrency } from "../../../lib/formatUtils";
import { DateText } from "../../../components/ui/DateText";
import { DashboardChartBarH } from "../dashboardChartBars";
import { StripDynamicsBadge, type StripDynamics } from "../StripDynamicsBadge";

export type DashboardStripDiagramRow = {
    label?: string;
    name?: string;
    value: number;
    percent: number;
    color: string;
    dynamics?: StripDynamics | null;
};

export type DashboardStripLineChartData = {
    dates: string[];
    series: { name: string; color: string; values: number[] }[];
    maxY: number;
};

export type DashboardPeriodTrend = {
    direction: 'up' | 'down' | null;
    percent: number;
    delta: number;
};

export type DashboardMetricsStripProps = {
    showSums: boolean;
    useServiceRequest: boolean;
    apiDateRange: { dateFrom: string; dateTo: string };
    comparePeriodRange: { dateFrom: string; dateTo: string } | null;
    comparePeriodOverride: boolean;
    prevPeriodLoading: boolean;
    onOpenComparePeriod: () => void;
    chartType: 'money' | 'paidWeight' | 'weight' | 'volume' | 'pieces';
    setChartType: (v: 'money' | 'paidWeight' | 'weight' | 'volume' | 'pieces') => void;
    dateFilter: string;
    stripValueLabel: string;
    periodToPeriodTrend: DashboardPeriodTrend | null;
    stripTrend: 'up' | 'down' | null;
    chartDataLength: number;
    stripTab: 'type' | 'sender' | 'receiver' | 'customer';
    setStripTab: (v: 'type' | 'sender' | 'receiver' | 'customer') => void;
    stripDiagramByType: DashboardStripDiagramRow[];
    stripDiagramBySender: DashboardStripDiagramRow[];
    stripDiagramByReceiver: DashboardStripDiagramRow[];
    stripDiagramByCustomer: DashboardStripDiagramRow[];
    stripShowAsPercent: boolean;
    setStripShowAsPercent: React.Dispatch<React.SetStateAction<boolean>>;
    formatStripDelta: (delta: number) => string;
    stripLineChartData: DashboardStripLineChartData | null;
    chartBarFillEnabled: boolean;
};

function formatStripRowValue(
    row: DashboardStripDiagramRow,
    chartType: DashboardMetricsStripProps['chartType'],
    showSums: boolean,
    stripShowAsPercent: boolean,
): string {
    if (!showSums || stripShowAsPercent) return `${row.percent}%`;
    if (chartType === 'money') return formatCurrency(row.value, true);
    if (chartType === 'paidWeight' || chartType === 'weight') return `${Math.round(row.value).toLocaleString('ru-RU')} кг`;
    if (chartType === 'pieces') return `${Math.round(row.value).toLocaleString('ru-RU')} шт`;
    return `${Math.round(row.value).toLocaleString('ru-RU')} м³`;
}

function StripDiagramRows({
    rows,
    chartType,
    showSums,
    stripShowAsPercent,
    setStripShowAsPercent,
    formatStripDelta,
    chartBarFillEnabled,
    nameMaxWidth,
}: {
    rows: DashboardStripDiagramRow[];
    chartType: DashboardMetricsStripProps['chartType'];
    showSums: boolean;
    stripShowAsPercent: boolean;
    setStripShowAsPercent: React.Dispatch<React.SetStateAction<boolean>>;
    formatStripDelta: (delta: number) => string;
    chartBarFillEnabled: boolean;
    nameMaxWidth?: number;
}) {
    return (
        <>
            {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                    <Typography.Body
                        style={{
                            flexShrink: 0,
                            ...(nameMaxWidth != null
                                ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: nameMaxWidth }
                                : { width: 56 }),
                        }}
                        title={row.name ?? row.label}
                    >
                        {row.name ?? row.label}
                    </Typography.Body>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                            <DashboardChartBarH enabled={chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                        </div>
                    </div>
                    {row.dynamics != null && (
                        <StripDynamicsBadge dynamics={row.dynamics} formatDelta={formatStripDelta} />
                    )}
                    <Typography.Body
                        component="span"
                        style={{ flexShrink: 0, fontWeight: 600, minWidth: nameMaxWidth != null ? 36 : undefined, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                    >
                        {formatStripRowValue(row, chartType, showSums, stripShowAsPercent)}
                    </Typography.Body>
                </div>
            ))}
        </>
    );
}

function StripLineChart({ data }: { data: DashboardStripLineChartData }) {
    const chartWidth = Math.max(560, data.dates.length * 56);
    const chartHeight = 250;
    const left = 56;
    const right = 14;
    const top = 12;
    const bottom = 50;
    const innerW = chartWidth - left - right;
    const innerH = chartHeight - top - bottom;
    const xStep = data.dates.length > 1 ? innerW / (data.dates.length - 1) : 0;
    const yTicks = 4;
    const xLabelStep = Math.max(1, Math.ceil(data.dates.length / 6));
    const xLabel = (dateKey: string) => {
        const parts = dateKey.split('-');
        if (parts.length !== 3) return dateKey;
        return `${parts[2]}.${parts[1]}`;
    };

    return (
        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--color-border)' }}>
            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginBottom: '0.45rem' }}>
                Динамика по датам (X — даты, Y — сумма, ₽)
            </Typography.Body>
            <div style={{ overflowX: 'auto' }}>
                <svg width={chartWidth} height={chartHeight} style={{ display: 'block', minWidth: `${chartWidth}px` }}>
                    {Array.from({ length: yTicks + 1 }).map((_, idx) => {
                        const ratio = idx / yTicks;
                        const y = top + innerH * (1 - ratio);
                        const value = data.maxY * ratio;
                        return (
                            <g key={`y-grid-${idx}`}>
                                <line x1={left} y1={y} x2={chartWidth - right} y2={y} stroke="var(--color-border)" strokeOpacity={0.55} strokeDasharray="3 3" />
                                <text x={left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--color-text-secondary)">
                                    {Math.round(value).toLocaleString('ru-RU')}
                                </text>
                            </g>
                        );
                    })}
                    {data.series.map((line) => {
                        const points = line.values.map((val, idx) => ({
                            x: left + xStep * idx,
                            y: top + innerH - (val / data.maxY) * innerH,
                            val,
                        }));
                        const d = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                        return (
                            <g key={line.name}>
                                <path d={d} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" />
                                {points.map((p, idx) => (
                                    <circle key={`${line.name}-${idx}`} cx={p.x} cy={p.y} r={2.5} fill={line.color}>
                                        <title>{`${line.name}: ${Math.round(p.val).toLocaleString('ru-RU')} ₽`}</title>
                                    </circle>
                                ))}
                            </g>
                        );
                    })}
                    {data.dates.map((date, idx) => {
                        if (idx % xLabelStep !== 0 && idx !== data.dates.length - 1) return null;
                        const x = left + xStep * idx;
                        return (
                            <text key={`x-${date}-${idx}`} x={x} y={chartHeight - 18} textAnchor="middle" fontSize="10" fill="var(--color-text-secondary)">
                                {xLabel(date)}
                            </text>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

export function DashboardMetricsStrip({
    showSums,
    useServiceRequest,
    apiDateRange,
    comparePeriodRange,
    comparePeriodOverride,
    prevPeriodLoading,
    onOpenComparePeriod,
    chartType,
    setChartType,
    dateFilter,
    stripValueLabel,
    periodToPeriodTrend,
    stripTrend,
    chartDataLength,
    stripTab,
    setStripTab,
    stripDiagramByType,
    stripDiagramBySender,
    stripDiagramByReceiver,
    stripDiagramByCustomer,
    stripShowAsPercent,
    setStripShowAsPercent,
    formatStripDelta,
    stripLineChartData,
    chartBarFillEnabled,
}: DashboardMetricsStripProps) {
    const stripTabs = (useServiceRequest ? ['type', 'sender', 'receiver', 'customer'] : ['type', 'sender', 'receiver']) as const;

    return (
        <div
            className="home-strip"
            style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                marginBottom: '1rem',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    minWidth: 0,
                }}
            >
                <span style={{ flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
                    <Typography.Body style={{ color: 'var(--color-primary-blue)', fontWeight: 600, fontSize: '0.6rem' }}>
                        <DateText value={apiDateRange.dateFrom} /> – <DateText value={apiDateRange.dateTo} />
                    </Typography.Body>
                    {useServiceRequest ? (
                        <button
                            type="button"
                            onClick={onOpenComparePeriod}
                            style={{
                                display: 'block',
                                margin: 0,
                                marginTop: '0.2rem',
                                padding: 0,
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                            title={
                                comparePeriodRange
                                    ? `Период сравнения для динамики %${comparePeriodOverride ? ' (выбран вручную)' : ''}. Нажмите, чтобы изменить.`
                                    : 'Выберите период для сравнения динамики'
                            }
                        >
                            <Typography.Body
                                style={{
                                    color: comparePeriodOverride ? 'var(--color-primary-blue)' : 'var(--color-text-secondary)',
                                    fontWeight: 500,
                                    fontSize: '0.55rem',
                                }}
                            >
                                {prevPeriodLoading && !comparePeriodRange ? (
                                    'в сравнении с предыдущим периодом…'
                                ) : comparePeriodRange ? (
                                    <>
                                        в сравнении с <DateText value={comparePeriodRange.dateFrom} /> – <DateText value={comparePeriodRange.dateTo} />
                                        {comparePeriodOverride ? ' ✎' : ''}
                                    </>
                                ) : (
                                    'в сравнении с… (выберите период)'
                                )}
                            </Typography.Body>
                        </button>
                    ) : null}
                </span>
                <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }}>
                    {showSums && (
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none' }} onClick={() => setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    )}
                    <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none' }} onClick={() => setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none' }} onClick={() => setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none' }} onClick={() => setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none' }} onClick={() => setChartType('pieces')} title="Шт"><Package className="w-4 h-4" style={{ color: chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                </Flex>
            </div>
            <div style={{ padding: '1.25rem 1rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                <Flex align="center" gap="0.5rem" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                    {dateFilter === 'неделя' && (
                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem', color: 'var(--color-text-secondary)', marginRight: '0.5rem' }}>За неделю:</Typography.Body>
                    )}
                    <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem' }}>{stripValueLabel}</Typography.Body>
                    {useServiceRequest && prevPeriodLoading && (
                        <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }} title="Расчёт динамики">
                            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                        </Flex>
                    )}
                    {useServiceRequest && !prevPeriodLoading && periodToPeriodTrend && (
                        <>
                            {periodToPeriodTrend.direction === 'up' && (
                                <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                    <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} />
                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        +{periodToPeriodTrend.percent}% ({formatStripDelta(periodToPeriodTrend.delta)})
                                    </Typography.Body>
                                </Flex>
                            )}
                            {periodToPeriodTrend.direction === 'down' && (
                                <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                    <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} />
                                    <Typography.Body style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        -{periodToPeriodTrend.percent}% ({formatStripDelta(periodToPeriodTrend.delta)})
                                    </Typography.Body>
                                </Flex>
                            )}
                            {periodToPeriodTrend.direction === null && periodToPeriodTrend.percent === 0 && (
                                <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                    <Minus className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                        0% ({formatStripDelta(periodToPeriodTrend.delta)})
                                    </Typography.Body>
                                </Flex>
                            )}
                        </>
                    )}
                    {!useServiceRequest && (
                        <>
                            {stripTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)', flexShrink: 0 }} title="Тренд вверх (вторая половина периода больше первой)" />}
                            {stripTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444', flexShrink: 0 }} title="Тренд вниз (вторая половина периода меньше первой)" />}
                            {stripTrend === null && chartDataLength >= 2 && <Minus className="w-5 h-5" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} title="Без выраженного тренда" />}
                        </>
                    )}
                </Flex>
                <div style={{ marginBottom: '0.75rem', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                    <Flex gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                        {stripTabs.map((tab) => (
                            <Button
                                key={tab}
                                className="filter-button"
                                style={{
                                    flexShrink: 0,
                                    padding: '0.5rem 0.75rem',
                                    background: stripTab === tab ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                    color: stripTab === tab ? 'white' : 'var(--color-text-primary)',
                                    border: stripTab === tab ? '1px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                                }}
                                onClick={() => setStripTab(tab)}
                            >
                                {tab === 'type' ? 'Тип' : tab === 'sender' ? 'Отправитель' : tab === 'receiver' ? 'Получатель' : 'Заказчик'}
                            </Button>
                        ))}
                    </Flex>
                </div>
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {stripTab === 'type' && (
                        <StripDiagramRows rows={stripDiagramByType} chartType={chartType} showSums={showSums} stripShowAsPercent={stripShowAsPercent} setStripShowAsPercent={setStripShowAsPercent} formatStripDelta={formatStripDelta} chartBarFillEnabled={chartBarFillEnabled} />
                    )}
                    {stripTab === 'sender' && (
                        <StripDiagramRows rows={stripDiagramBySender} chartType={chartType} showSums={showSums} stripShowAsPercent={stripShowAsPercent} setStripShowAsPercent={setStripShowAsPercent} formatStripDelta={formatStripDelta} chartBarFillEnabled={chartBarFillEnabled} nameMaxWidth={140} />
                    )}
                    {stripTab === 'receiver' && (
                        <StripDiagramRows rows={stripDiagramByReceiver} chartType={chartType} showSums={showSums} stripShowAsPercent={stripShowAsPercent} setStripShowAsPercent={setStripShowAsPercent} formatStripDelta={formatStripDelta} chartBarFillEnabled={chartBarFillEnabled} nameMaxWidth={140} />
                    )}
                    {stripTab === 'customer' && (
                        <StripDiagramRows rows={stripDiagramByCustomer} chartType={chartType} showSums={showSums} stripShowAsPercent={stripShowAsPercent} setStripShowAsPercent={setStripShowAsPercent} formatStripDelta={formatStripDelta} chartBarFillEnabled={chartBarFillEnabled} nameMaxWidth={140} />
                    )}
                </div>
                {stripLineChartData && <StripLineChart data={stripLineChartData} />}
            </div>
        </div>
    );
}
