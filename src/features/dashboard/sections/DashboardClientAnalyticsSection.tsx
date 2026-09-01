import React from "react";
import { motion } from "motion/react";
import { Loader2, ArrowDown, ArrowUp } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel } from "../../../components/shared/CargoTableDisplay";
import { DateText } from "../../../components/ui/DateText";
import {
    DashboardChartBarH,
    DashboardChartBarPixelHeight,
    CHART_BAR_FILL_DURATION,
    CHART_BAR_FILL_EASE,
} from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardClientAnalyticsSection({ page }: Props) {
    return (
        <>
{/* ═══════ ГРУППА 5: АНАЛИТИКА КЛИЕНТОВ ═══════ */}

            {/* 5.2 Lifetime Value (LTV) */}
            {page.useServiceRequest && !page.loading && !page.error && page.customerLtv && page.customerLtv.top10.length > 0 && page.showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Lifetime Value (LTV)</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Накопленная выручка по клиенту с момента первого заказа. Средний LTV: <span style={{ fontWeight: 600 }}>{Math.round(page.customerLtv.avgLtv).toLocaleString('ru-RU')} ₽</span> ({page.customerLtv.totalCustomers} клиентов)
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {page.customerLtv.top10.map((c, i) => {
                            const maxSum = page.customerLtv.top10[0]?.sum || 1;
                            return (
                                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600, width: 22, textAlign: 'right', color: i < 3 ? '#f59e0b' : 'var(--color-text-secondary)' }}>#{i + 1}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.75rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</Typography.Body>
                                    <div style={{ width: '30%', flexShrink: 0 }}>
                                        <div style={{ height: 10, borderRadius: 5, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={Math.round((c.sum / maxSum) * 100)} delay={i * 0.04} style={{ background: i < 3 ? '#f59e0b' : '#3b82f6', borderRadius: 5 }} />
                                        </div>
                                    </div>
                                    <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600, minWidth: 72, textAlign: 'right' }}>{Math.round(c.sum).toLocaleString('ru-RU')} ₽</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', minWidth: 40, textAlign: 'right' }}>{c.count} шт</Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            )}

            {/* 5.4 RFM-сегментация */}
            {page.useServiceRequest && !page.loading && !page.error && page.rfmSegments && page.rfmSegments.segments.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>RFM-сегментация</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Recency (давность) × Frequency (частота) × Monetary (сумма). Всего клиентов: {page.rfmSegments.total}. Нажмите на сегмент — список заказчиков.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {page.rfmSegments.segments.map((seg, ri) => {
                            const pct = page.rfmSegments.total > 0 ? Math.round((seg.count / page.rfmSegments.total) * 100) : 0;
                            const isExpanded = page.expandedRfmSegment === seg.name;
                            return (
                                <div key={seg.name}>
                                    <button type="button" onClick={() => page.setExpandedRfmSegment(isExpanded ? null : seg.name)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', background: isExpanded ? 'var(--color-bg-hover)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
                                        <Typography.Body style={{ fontSize: '0.75rem', width: 130, flexShrink: 0, fontWeight: 600 }}>{seg.name}</Typography.Body>
                                        <div style={{ flex: 1, height: 16, borderRadius: 8, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={pct} delay={ri * 0.04} style={{ background: seg.color, borderRadius: 8, minWidth: pct > 0 ? 4 : 0 }} />
                                        </div>
                                        <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{seg.count}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', minWidth: 30, textAlign: 'right' }}>{pct}%</Typography.Body>
                                        {page.showSums && <Typography.Body style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', minWidth: 70, textAlign: 'right' }}>Ø {Math.round(seg.avgSum).toLocaleString('ru-RU')} ₽</Typography.Body>}
                                    </button>
                                    {isExpanded && page.rfmSegments.customersBySegment && page.rfmSegments.customersBySegment[seg.name] && (
                                        <div style={{ marginTop: '0.35rem', marginBottom: '0.25rem', marginLeft: 8, padding: '0.5rem 0.6rem', background: 'var(--color-bg-hover)', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
                                            <Typography.Body style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.35rem', color: seg.color }}>Заказчики ({page.rfmSegments.customersBySegment[seg.name].length})</Typography.Body>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                {page.rfmSegments.customersBySegment[seg.name].map((c, i) => (
                                                    <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem' }}>
                                                        <Typography.Body style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</Typography.Body>
                                                        {page.showSums && <Typography.Body style={{ flexShrink: 0, fontWeight: 600 }}>{Math.round(c.monetary).toLocaleString('ru-RU')} ₽</Typography.Body>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <Flex gap="0.4rem" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        {page.rfmSegments.segments.map(s => (
                            <Flex key={s.name} align="center" gap="0.2rem">
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                                <Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>{s.name}</Typography.Body>
                            </Flex>
                        ))}
                    </Flex>
                </Panel>
            )}

            {/* 5.5 Платёжная дисциплина */}
            {page.useServiceRequest && !page.loading && !page.error && page.paymentDiscipline && page.paymentDiscipline.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Платёжная дисциплина</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Доля оплаченных перевозок по каждому клиенту. Чем ниже процент оплаты — тем хуже дисциплина.
                    </Typography.Body>
                    <div className="dashboard-scroll-table-wrap" style={{ overflowY: 'auto', maxHeight: 320, fontSize: '0.7rem', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                        <table className="dashboard-scroll-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-bg-hover)', position: 'sticky', top: 0, zIndex: 1 }}>
                                    {(() => {
                                        const togglePaySort = (col: typeof page.paymentDisciplineSortCol) => {
                                            if (page.paymentDisciplineSortCol === col) page.setPaymentDisciplineSortAsc(!page.paymentDisciplineSortAsc);
                                            else { page.setPaymentDisciplineSortCol(col); page.setPaymentDisciplineSortAsc(col === 'name'); }
                                        };
                                        const payArrow = (col: typeof page.paymentDisciplineSortCol) => page.paymentDisciplineSortCol === col ? (page.paymentDisciplineSortAsc ? ' ↑' : ' ↓') : '';
                                        const payTh = (label: string, col: typeof page.paymentDisciplineSortCol, align: 'left' | 'center') => (
                                            <th key={col} style={{ padding: '0.3rem 0.4rem', textAlign: align, fontWeight: 600, borderBottom: '2px solid var(--color-border)', cursor: 'pointer', userSelect: 'none', background: 'var(--color-bg-hover)' }} onClick={() => togglePaySort(col)} title="Сортировка">{label}{payArrow(col)}</th>
                                        );
                                        return (
                                            <>
                                                {payTh('Клиент', 'name', 'left')}
                                                {payTh('Всего', 'count', 'center')}
                                                {payTh('Оплачено', 'paid', 'center')}
                                                {payTh('Не оплач.', 'unpaid', 'center')}
                                                {payTh('% оплаты', 'paidRate', 'center')}
                                            </>
                                        );
                                    })()}
                                </tr>
                            </thead>
                            <tbody>
                                {[...page.paymentDiscipline]
                                    .sort((a, b) => {
                                        let cmp = 0;
                                        if (page.paymentDisciplineSortCol === 'name') cmp = a.name.localeCompare(b.name);
                                        else if (page.paymentDisciplineSortCol === 'count') cmp = a.count - b.count;
                                        else if (page.paymentDisciplineSortCol === 'paid') cmp = a.paid - b.paid;
                                        else if (page.paymentDisciplineSortCol === 'unpaid') cmp = a.unpaid - b.unpaid;
                                        else cmp = a.paidRate - b.paidRate;
                                        return page.paymentDisciplineSortAsc ? cmp : -cmp;
                                    })
                                    .map((c, pi) => {
                                    const color = c.paidRate >= 80 ? '#10b981' : c.paidRate >= 50 ? '#f59e0b' : '#ef4444';
                                    return (
                                        <tr key={c.name} className="dashboard-scroll-table__data-row">
                                            <td data-label="Клиент" style={{ padding: '0.25rem 0.4rem', borderBottom: '1px solid var(--color-border)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</td>
                                            <td data-label="Всего" style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>{c.count}</td>
                                            <td data-label="Оплачено" style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)', color: '#10b981', fontWeight: 600 }}>{c.paid}</td>
                                            <td data-label="Не оплач." style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)', color: '#ef4444', fontWeight: 600 }}>{c.unpaid}</td>
                                            <td data-label="% оплаты" style={{ padding: '0.25rem 0.4rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                                                    <div style={{ width: 40, height: 6, borderRadius: 3, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                                        <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={c.paidRate} delay={Math.min(pi * 0.012, 0.35)} style={{ background: color, borderRadius: 3 }} />
                                                    </div>
                                                    <span style={{ fontWeight: 600, color }}>{c.paidRate}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            {/* 5.6 Маржинальность по клиентам */}
            {page.useServiceRequest && !page.loading && !page.error && page.customerMargin && page.customerMargin.length > 0 && page.showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Выручка на кг по клиентам</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Стоимость перевозки на 1 кг платного веса. Чем выше — тем выгоднее клиент.
                    </Typography.Body>
                    <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {page.customerMargin.map((c, i) => {
                            const maxPerKg = Math.max(...page.customerMargin.map(x => x.perKg), 1);
                            return (
                                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Typography.Body style={{ fontSize: '0.75rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</Typography.Body>
                                    <div style={{ width: '25%', flexShrink: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={Math.round((c.perKg / maxPerKg) * 100)} delay={i * 0.025} style={{ background: i < 3 ? '#10b981' : '#3b82f6', borderRadius: 4 }} />
                                        </div>
                                    </div>
                                    <Typography.Body style={{ fontSize: '0.72rem', fontWeight: 600, minWidth: 55, textAlign: 'right' }}>{c.perKg.toFixed(1)} ₽/кг</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', minWidth: 60, textAlign: 'right' }}>{Math.round(c.sum).toLocaleString('ru-RU')} ₽</Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            )}

            {/* 5.7 Сезонность по клиентам */}
            {page.useServiceRequest && !page.loading && !page.error && page.clientSeasonality && page.clientSeasonality.rows.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Сезонность по клиентам</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Интенсивность грузопотока по месяцам. Чем ярче ячейка — тем больше заказов. Помогает выявить сезонных и стабильных клиентов.
                    </Typography.Body>
                    <div className="dashboard-seasonality-heatmap">
                    <div style={{ fontSize: '0.68rem' }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 0 }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '0.25rem 0.3rem', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid var(--color-border)', whiteSpace: 'nowrap' }}>Клиент</th>
                                    {['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'].map((m, i) => (
                                        <th key={i} style={{ padding: '0.25rem 0.2rem', textAlign: 'center', fontWeight: 500, borderBottom: '2px solid var(--color-border)', width: 28 }}>{m}</th>
                                    ))}
                                    <th style={{ padding: '0.25rem 0.3rem', textAlign: 'right', fontWeight: 600, borderBottom: '2px solid var(--color-border)' }}>Σ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page.clientSeasonality.rows.map(row => (
                                    <tr key={row.name}>
                                        <td style={{ padding: '0.2rem 0.3rem', borderBottom: '1px solid var(--color-border)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>{row.name}</td>
                                        {row.months.map((cnt, mi) => {
                                            const intensity = cnt / page.clientSeasonality.maxVal;
                                            return (
                                                <td key={mi} style={{
                                                    padding: '0.2rem 0.15rem', textAlign: 'center', borderBottom: '1px solid var(--color-border)',
                                                    background: cnt > 0 ? `rgba(37,99,235,${0.1 + intensity * 0.6})` : 'transparent',
                                                    color: intensity > 0.5 ? 'white' : 'var(--color-text-primary)', fontWeight: cnt > 0 ? 600 : 400,
                                                }}>
                                                    {cnt > 0 ? cnt : ''}
                                                </td>
                                            );
                                        })}
                                        <td style={{ padding: '0.2rem 0.3rem', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>{row.total}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    </div>
                    <div className="dashboard-seasonality-cards">
                        {page.clientSeasonality.rows.slice(0, 8).map((row) => {
                            const peakMonth = row.months.reduce((best, cnt, mi) => (cnt > row.months[best] ? mi : best), 0);
                            const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
                            return (
                                <div key={row.name} style={{ padding: '0.45rem 0.55rem', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg-hover)' }}>
                                    <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>{row.name}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>
                                        Всего: {row.total} · Пик: {monthNames[peakMonth]} ({row.months[peakMonth]})
                                    </Typography.Body>
                                    <div style={{ display: 'flex', gap: 2, marginTop: '0.3rem', alignItems: 'flex-end', height: 28 }}>
                                        {row.months.map((cnt, mi) => {
                                            const h = row.total > 0 ? Math.max(2, Math.round((cnt / Math.max(...row.months, 1)) * 24)) : 2;
                                            return (
                                                <div key={mi} title={`${monthNames[mi]}: ${cnt}`} style={{ flex: 1, height: h, borderRadius: 2, background: cnt > 0 ? `rgba(37,99,235,${0.25 + (cnt / page.clientSeasonality.maxVal) * 0.65})` : 'var(--color-border)' }} />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            )}

            {/* 5.9 Средний чек / средний вес */}
            {page.useServiceRequest && !page.loading && !page.error && page.avgCheckTrend && page.avgCheckTrend.length > 1 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Средний чек и вес</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Динамика среднего чека (₽) и среднего платного веса (кг) по месяцам. Показывает тренд стоимости и объёма заказов.
                    </Typography.Body>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100, marginBottom: '0.25rem' }}>
                        {page.avgCheckTrend.map((m, i) => {
                            const maxAvgPw = Math.max(...page.avgCheckTrend.map(x => x.avgPw), 1);
                            const h = Math.round((m.avgPw / maxAvgPw) * 90);
                            return (
                                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <Typography.Body style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{m.avgPw}</Typography.Body>
                                    <DashboardChartBarPixelHeight enabled={page.chartBarFillEnabled} heightPx={h} delay={i * 0.05} style={{ background: '#3b82f6', borderRadius: '4px 4px 0 0' }} />
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                        {page.avgCheckTrend.map(m => (
                            <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                                <Typography.Body style={{ fontSize: '0.55rem', color: 'var(--color-text-secondary)' }}>{m.month.slice(2)}</Typography.Body>
                            </div>
                        ))}
                    </div>
                    {page.showSums && (
                        <div style={{ display: 'flex', gap: 3, marginTop: '0.35rem' }}>
                            {page.avgCheckTrend.map(m => (
                                <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                                    <Typography.Body style={{ fontSize: '0.55rem', color: '#f59e0b', fontWeight: 600 }}>{m.avgSum.toLocaleString('ru-RU')} ₽</Typography.Body>
                                </div>
                            ))}
                        </div>
                    )}
                    <Flex gap="0.5rem" style={{ marginTop: '0.35rem' }}>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Средний вес (кг)</Typography.Body></Flex>
                        {page.showSums && <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Средний чек (₽)</Typography.Body></Flex>}
                    </Flex>
                </Panel>
            )}

            {/* 5.10 Предпочтения по типу доставки */}
            {page.useServiceRequest && !page.loading && !page.error && page.deliveryPreferences && page.deliveryPreferences.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>Предпочтения по типу доставки</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Доля паром / авто / авиа по клиентам. Помогает выявить предпочтения и потенциал для переключения на другой тип.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {page.deliveryPreferences.map((c, di) => (
                            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Typography.Body style={{ fontSize: '0.72rem', width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</Typography.Body>
                                <div style={{ flex: 1, height: 14, borderRadius: 7, background: 'var(--color-bg-hover)', overflow: 'hidden', display: 'flex' }}>
                                    {c.ferry > 0 && <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={c.ferryPct} delay={di * 0.04} style={{ background: '#3b82f6' }} />}
                                    {c.auto > 0 && <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={c.autoPct} delay={di * 0.04 + 0.05} style={{ background: '#f59e0b' }} />}
                                    {c.air > 0 && <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={c.airPct} delay={di * 0.04 + 0.1} style={{ background: '#6366f1' }} />}
                                </div>
                                <Typography.Body style={{ fontSize: '0.65rem', minWidth: 72, textAlign: 'right' }}>
                                    <span style={{ color: '#3b82f6' }}>{c.ferry}</span>/
                                    <span style={{ color: '#f59e0b' }}>{c.auto}</span>/
                                    <span style={{ color: '#6366f1' }}>{c.air}</span>
                                </Typography.Body>
                            </div>
                        ))}
                    </div>
                    <Flex gap="0.5rem" style={{ marginTop: '0.35rem' }}>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Паром</Typography.Body></Flex>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Авто</Typography.Body></Flex>
                        <Flex align="center" gap="0.2rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} /><Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)' }}>Авиа</Typography.Body></Flex>
                    </Flex>
                </Panel>
            )}

        </>
    );
}
