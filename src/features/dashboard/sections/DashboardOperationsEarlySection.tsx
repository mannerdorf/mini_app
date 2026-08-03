import React from "react";
import { motion } from "motion/react";
import {
    Loader2, ArrowDown, ArrowUp, Package, Scale, Weight, List, RussianRuble,
    TrendingUp, TrendingDown, Ship, Truck, ChevronDown, Filter, Info,
} from "lucide-react";
import { Button, Flex, Grid, Panel, Typography } from "@maxhub/max-ui";
import * as dateUtils from "../../../lib/dateUtils";
import { normalizeStatus, STATUS_MAP } from "../../../lib/statusUtils";
import { formatCurrency, stripOoo } from "../../../lib/formatUtils";
import { ClickableCargoNumber, leafRowClickProps } from "../../../components/ui/EntityLinks";
import { RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel } from "../../../components/shared/CargoTableDisplay";
import { DateText } from "../../../components/ui/DateText";
import {
    DASH_PLAN_FACT_TYPO,
    DashboardChartBarH,
    DashboardChartBarPixelHeight,
    CHART_BAR_FILL_DURATION,
    CHART_BAR_FILL_EASE,
} from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

const { formatDate } = dateUtils;

type Props = { page: DashboardPageState };

export function DashboardOperationsEarlySection({ page }: Props) {
    return (
        <>
{/* ═══════ ГРУППА 2: ОПЕРАЦИОННАЯ НАГРУЗКА ═══════ */}

            {/* 10. Распределение по дням недели */}
            {page.useServiceRequest && !page.weekdayDistributionLoading && !page.error && page.weekdayDistribution.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: '0.25rem' }}>
                        <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600 }}>
                            Загрузка по дням недели
                        </Typography.Headline>
                        <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                            <Button
                                type="button"
                                className="filter-button"
                                onClick={() => page.setWeekdayDistributionMode("received")}
                                style={{
                                    padding: "0.3rem 0.55rem",
                                    fontSize: "0.78rem",
                                    borderRadius: 8,
                                    border: "none",
                                    background: page.weekdayDistributionMode === "received" ? "var(--color-primary-blue)" : "transparent",
                                    color: page.weekdayDistributionMode === "received" ? "#fff" : "var(--color-text-secondary)",
                                }}
                                title="По дате прихода (DatePrih) в выбранном периоде"
                            >
                                Получено
                            </Button>
                            <Button
                                type="button"
                                className="filter-button"
                                onClick={() => page.setWeekdayDistributionMode("issued")}
                                style={{
                                    padding: "0.3rem 0.55rem",
                                    fontSize: "0.78rem",
                                    borderRadius: 8,
                                    border: "none",
                                    background: page.weekdayDistributionMode === "issued" ? "var(--color-primary-blue)" : "transparent",
                                    color: page.weekdayDistributionMode === "issued" ? "#fff" : "var(--color-text-secondary)",
                                }}
                                title="По фактической дате выдачи / доставки (DateVr и др.) в выбранном периоде"
                            >
                                Выдано
                            </Button>
                        </Flex>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                        {page.weekdayDistributionMode === "received"
                            ? "Количество приёмок и платный вес по дню недели даты прихода (в периоде фильтра)."
                            : "Количество выдач и платный вес по дню недели фактической даты доставки / вручения (в периоде фильтра)."}
                    </Typography.Body>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-end', height: 100, marginBottom: '0.4rem' }}>
                        {page.weekdayDistribution.map((d, idx) => {
                            const colH = d.count === 0 ? 0 : Math.max(d.percent, 4);
                            return (
                            <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                                <motion.div
                                    style={{ width: '100%', maxWidth: 38, display: 'flex', flexDirection: 'column', borderRadius: '5px 5px 0 0', overflow: 'hidden' }}
                                    initial={page.chartBarFillEnabled ? { height: '0%' } : false}
                                    animate={{ height: `${colH}%` }}
                                    transition={page.chartBarFillEnabled ? { duration: CHART_BAR_FILL_DURATION, ease: CHART_BAR_FILL_EASE, delay: idx * 0.05 } : { duration: 0 }}
                                >
                                    {d.ferry > 0 && <div style={{ flex: d.ferry, background: '#3b82f6' }} title={`Паром: ${d.ferry}`} />}
                                    {d.auto > 0 && <div style={{ flex: d.auto, background: '#f59e0b' }} title={`Авто: ${d.auto}`} />}
                                    {d.count === 0 && <div style={{ flex: 1, background: 'var(--color-bg-hover)' }} />}
                                </motion.div>
                            </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        {page.weekdayDistribution.map((d) => (
                            <div key={`lbl-${d.label}`} style={{ flex: 1, textAlign: 'center' }}>
                                <Typography.Body style={{ fontSize: '0.72rem', color: d.label === 'Сб' || d.label === 'Вс' ? '#ef4444' : 'var(--color-text-secondary)', fontWeight: 600, display: 'block', lineHeight: '1.2' }}>{d.label}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', display: 'block', lineHeight: '1.2', marginTop: '0.1rem' }}>{d.count} шт</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', display: 'block', lineHeight: '1.2', marginTop: '0.05rem' }}>{Math.round(d.pw).toLocaleString('ru-RU')} кг</Typography.Body>
                            </div>
                        ))}
                    </div>
                    <Flex gap="0.75rem">
                        <Flex align="center" gap="0.25rem"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} /><Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Паром</Typography.Body></Flex>
                        <Flex align="center" gap="0.25rem"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>Авто</Typography.Body></Flex>
                    </Flex>
                </Panel>
            )}

            {page.useServiceRequest && !page.loading && !page.error && page.lastMileTerminalLoad.totals.count > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>
                        Загрузка терминалов: самовывоз / доставка
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.65rem' }}>
                        Разбивка текущего периода по последней миле. Проценты считаются от общего итога по каждой метрике.
                    </Typography.Body>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                        {page.lastMileTerminalLoad.rows.map((row, rowIndex) => {
                            const pct = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
                            const metrics = [
                                { key: 'w', label: 'Кг', value: row.w, total: page.lastMileTerminalLoad.totals.w, suffix: 'кг' },
                                { key: 'vol', label: 'Объём', value: row.vol, total: page.lastMileTerminalLoad.totals.vol, suffix: 'м³', digits: 2 },
                                { key: 'pw', label: 'Платный вес', value: row.pw, total: page.lastMileTerminalLoad.totals.pw, suffix: 'кг' },
                                { key: 'mest', label: 'Шт / мест', value: row.mest, total: page.lastMileTerminalLoad.totals.mest, suffix: 'шт' },
                                ...(page.showSums ? [{ key: 'sum', label: 'Рубли', value: row.sum, total: page.lastMileTerminalLoad.totals.sum, suffix: '₽', money: true }] : []),
                            ];
                            const countPct = pct(row.count, page.lastMileTerminalLoad.totals.count);
                            return (
                                <div key={row.key} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '0.75rem', background: 'var(--color-bg-hover)' }}>
                                    <Flex align="center" justify="space-between" style={{ gap: '0.5rem', marginBottom: '0.6rem' }}>
                                        <Flex align="center" gap="0.4rem" style={{ minWidth: 0 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                            <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 700 }}>{row.label}</Typography.Body>
                                        </Flex>
                                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                            {row.count.toLocaleString('ru-RU')} перевозок · {countPct}%
                                        </Typography.Body>
                                    </Flex>
                                    <div style={{ height: 10, borderRadius: 999, background: 'var(--color-bg-card)', overflow: 'hidden', marginBottom: '0.7rem' }}>
                                        <DashboardChartBarH
                                            enabled={page.chartBarFillEnabled}
                                            widthPercent={countPct}
                                            delay={rowIndex * 0.08}
                                            style={{ background: row.color, borderRadius: 999, minWidth: countPct > 0 ? 4 : 0 }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '0.45rem' }}>
                                        {metrics.map((metric, metricIndex) => {
                                            const metricPct = pct(metric.value, metric.total);
                                            const formattedValue = metric.money
                                                ? formatCurrency(metric.value, true)
                                                : `${metric.value.toLocaleString('ru-RU', { maximumFractionDigits: metric.digits ?? 0 })} ${metric.suffix}`;
                                            return (
                                                <div key={metric.key} style={{ borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '0.5rem 0.55rem', minWidth: 0 }}>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.66rem', color: 'var(--color-text-secondary)', marginBottom: '0.22rem', whiteSpace: 'nowrap' }}>
                                                        {metric.label}
                                                    </Typography.Body>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, marginBottom: '0.25rem', whiteSpace: 'nowrap' }}>
                                                        {formattedValue}
                                                    </Typography.Body>
                                                    <Flex align="center" gap="0.35rem">
                                                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                                            <DashboardChartBarH
                                                                enabled={page.chartBarFillEnabled}
                                                                widthPercent={metricPct}
                                                                delay={rowIndex * 0.08 + metricIndex * 0.035}
                                                                style={{ background: row.color, borderRadius: 999, minWidth: metricPct > 0 ? 3 : 0 }}
                                                            />
                                                        </div>
                                                        <Typography.Body style={{ fontSize: '0.66rem', color: 'var(--color-text-secondary)', minWidth: 30, textAlign: 'right' }}>
                                                            {metricPct}%
                                                        </Typography.Body>
                                                    </Flex>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            )}

            {page.useServiceRequest && !page.loading && !page.error && page.pickupLogisticsLoad.totals.count > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>
                        Загрузка заборной логистики: PickUP / terminal-to
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.65rem' }}>
                        Разбивка текущего периода по месту старта груза. Проценты считаются от общего итога по каждой метрике.
                    </Typography.Body>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                        {page.pickupLogisticsLoad.rows.map((row, rowIndex) => {
                            const pct = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
                            const metrics = [
                                { key: 'w', label: 'Кг', value: row.w, total: page.pickupLogisticsLoad.totals.w, suffix: 'кг' },
                                { key: 'vol', label: 'Объём', value: row.vol, total: page.pickupLogisticsLoad.totals.vol, suffix: 'м³', digits: 2 },
                                { key: 'pw', label: 'Платный вес', value: row.pw, total: page.pickupLogisticsLoad.totals.pw, suffix: 'кг' },
                                { key: 'mest', label: 'Шт / мест', value: row.mest, total: page.pickupLogisticsLoad.totals.mest, suffix: 'шт' },
                                ...(page.showSums ? [{ key: 'sum', label: 'Рубли', value: row.sum, total: page.pickupLogisticsLoad.totals.sum, suffix: '₽', money: true }] : []),
                            ];
                            const countPct = pct(row.count, page.pickupLogisticsLoad.totals.count);
                            return (
                                <div key={row.key} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '0.75rem', background: 'var(--color-bg-hover)' }}>
                                    <Flex align="center" justify="space-between" style={{ gap: '0.5rem', marginBottom: '0.6rem' }}>
                                        <Flex align="center" gap="0.4rem" style={{ minWidth: 0 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                            <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 700 }}>{row.label}</Typography.Body>
                                        </Flex>
                                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                            {row.count.toLocaleString('ru-RU')} перевозок · {countPct}%
                                        </Typography.Body>
                                    </Flex>
                                    <div style={{ height: 10, borderRadius: 999, background: 'var(--color-bg-card)', overflow: 'hidden', marginBottom: '0.7rem' }}>
                                        <DashboardChartBarH
                                            enabled={page.chartBarFillEnabled}
                                            widthPercent={countPct}
                                            delay={rowIndex * 0.08}
                                            style={{ background: row.color, borderRadius: 999, minWidth: countPct > 0 ? 4 : 0 }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '0.45rem' }}>
                                        {metrics.map((metric, metricIndex) => {
                                            const metricPct = pct(metric.value, metric.total);
                                            const formattedValue = metric.money
                                                ? formatCurrency(metric.value, true)
                                                : `${metric.value.toLocaleString('ru-RU', { maximumFractionDigits: metric.digits ?? 0 })} ${metric.suffix}`;
                                            return (
                                                <div key={metric.key} style={{ borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '0.5rem 0.55rem', minWidth: 0 }}>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.66rem', color: 'var(--color-text-secondary)', marginBottom: '0.22rem', whiteSpace: 'nowrap' }}>
                                                        {metric.label}
                                                    </Typography.Body>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, marginBottom: '0.25rem', whiteSpace: 'nowrap' }}>
                                                        {formattedValue}
                                                    </Typography.Body>
                                                    <Flex align="center" gap="0.35rem">
                                                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                                            <DashboardChartBarH
                                                                enabled={page.chartBarFillEnabled}
                                                                widthPercent={metricPct}
                                                                delay={rowIndex * 0.08 + metricIndex * 0.035}
                                                                style={{ background: row.color, borderRadius: 999, minWidth: metricPct > 0 ? 3 : 0 }}
                                                            />
                                                        </div>
                                                        <Typography.Body style={{ fontSize: '0.66rem', color: 'var(--color-text-secondary)', minWidth: 30, textAlign: 'right' }}>
                                                            {metricPct}%
                                                        </Typography.Body>
                                                    </Flex>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            )}

            {page.useServiceRequest && !page.loading && !page.error && page.pickupByLastMileLoad.totals.count > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>
                        Загрузка: заборная логистика / терминалы
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.65rem' }}>
                        Сводная разбивка текущего периода по заборной логистике и последней миле. Нажмите на блок, чтобы открыть таблицу.
                    </Typography.Body>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                        {page.pickupByLastMileLoad.rows.map((row, rowIndex) => {
                            const pct = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
                            const metrics = [
                                { key: 'w', label: 'Кг', value: row.w, total: page.pickupByLastMileLoad.totals.w, suffix: 'кг' },
                                { key: 'vol', label: 'Объём', value: row.vol, total: page.pickupByLastMileLoad.totals.vol, suffix: 'м³', digits: 2 },
                                { key: 'pw', label: 'Платный вес', value: row.pw, total: page.pickupByLastMileLoad.totals.pw, suffix: 'кг' },
                                { key: 'mest', label: 'Шт / мест', value: row.mest, total: page.pickupByLastMileLoad.totals.mest, suffix: 'шт' },
                                ...(page.showSums ? [{ key: 'sum', label: 'Рубли', value: row.sum, total: page.pickupByLastMileLoad.totals.sum, suffix: '₽', money: true }] : []),
                            ];
                            const countPct = pct(row.count, page.pickupByLastMileLoad.totals.count);
                            const selected = page.selectedCombinedLogisticsKey === row.key;
                            return (
                                <div
                                    key={row.key}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => page.setSelectedCombinedLogisticsKey((current) => current === row.key ? null : row.key)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            page.setSelectedCombinedLogisticsKey((current) => current === row.key ? null : row.key);
                                        }
                                    }}
                                    style={{
                                        border: selected ? `1px solid ${row.color}` : '1px solid var(--color-border)',
                                        borderRadius: 12,
                                        padding: '0.75rem',
                                        background: selected ? 'var(--color-bg-card)' : 'var(--color-bg-hover)',
                                        boxShadow: selected ? `0 0 0 2px ${row.color}22` : undefined,
                                        cursor: 'pointer',
                                    }}
                                    title={selected ? 'Свернуть таблицу' : 'Показать заказчиков и перевозки'}
                                >
                                    <Flex align="center" justify="space-between" style={{ gap: '0.5rem', marginBottom: '0.6rem' }}>
                                        <Flex align="center" gap="0.4rem" style={{ minWidth: 0 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                            <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 700 }}>{row.label}</Typography.Body>
                                        </Flex>
                                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                            {row.count.toLocaleString('ru-RU')} перевозок · {countPct}%
                                        </Typography.Body>
                                    </Flex>
                                    <div style={{ height: 10, borderRadius: 999, background: 'var(--color-bg-card)', overflow: 'hidden', marginBottom: '0.7rem' }}>
                                        <DashboardChartBarH
                                            enabled={page.chartBarFillEnabled}
                                            widthPercent={countPct}
                                            delay={rowIndex * 0.08}
                                            style={{ background: row.color, borderRadius: 999, minWidth: countPct > 0 ? 4 : 0 }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: '0.45rem' }}>
                                        {metrics.map((metric, metricIndex) => {
                                            const metricPct = pct(metric.value, metric.total);
                                            const formattedValue = metric.money
                                                ? formatCurrency(metric.value, true)
                                                : `${metric.value.toLocaleString('ru-RU', { maximumFractionDigits: metric.digits ?? 0 })} ${metric.suffix}`;
                                            return (
                                                <div key={metric.key} style={{ borderRadius: 10, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', padding: '0.5rem 0.55rem', minWidth: 0 }}>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.66rem', color: 'var(--color-text-secondary)', marginBottom: '0.22rem', whiteSpace: 'nowrap' }}>
                                                        {metric.label}
                                                    </Typography.Body>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, marginBottom: '0.25rem', whiteSpace: 'nowrap' }}>
                                                        {formattedValue}
                                                    </Typography.Body>
                                                    <Flex align="center" gap="0.35rem">
                                                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                                            <DashboardChartBarH
                                                                enabled={page.chartBarFillEnabled}
                                                                widthPercent={metricPct}
                                                                delay={rowIndex * 0.08 + metricIndex * 0.035}
                                                                style={{ background: row.color, borderRadius: 999, minWidth: metricPct > 0 ? 3 : 0 }}
                                                            />
                                                        </div>
                                                        <Typography.Body style={{ fontSize: '0.66rem', color: 'var(--color-text-secondary)', minWidth: 30, textAlign: 'right' }}>
                                                            {metricPct}%
                                                        </Typography.Body>
                                                    </Flex>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {page.selectedCombinedLogisticsBucket && (
                        <div style={{ marginTop: '0.85rem', border: '1px solid var(--color-border)', borderRadius: 12, padding: '0.75rem', background: 'var(--color-bg-hover)' }}>
                            <Flex align="center" justify="space-between" gap="0.5rem" style={{ marginBottom: '0.55rem' }}>
                                <Typography.Body style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                                    Заказчики: {page.selectedCombinedLogisticsBucket.label}
                                </Typography.Body>
                                <Button
                                    type="button"
                                    className="filter-button"
                                    onClick={() => page.setSelectedCombinedLogisticsKey(null)}
                                    style={{ padding: '0.25rem 0.45rem', fontSize: '0.76rem' }}
                                >
                                    Свернуть
                                </Button>
                            </Flex>
                            <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'left', fontWeight: 600, width: 28 }}>#</th>
                                            <th className="customer-col" style={{ padding: '0.4rem 0.45rem', textAlign: 'left', fontWeight: 600 }}>Заказчик</th>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600 }}>Перевозки</th>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600 }}>Кг</th>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600 }}>Объём</th>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600 }}>Плат. вес</th>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600 }}>Мест</th>
                                            {page.showSums && <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600 }}>Рубли</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {page.combinedLogisticsCustomerRows.map((customerRow, idx) => {
                                            const expanded = page.expandedCombinedLogisticsCustomer === customerRow.customer;
                                            const sortedItems = [...customerRow.items].sort((a, b) => {
                                                const da = dateUtils.parseDateOnly(String(a?.DatePrih ?? ''))?.getTime() ?? 0;
                                                const db = dateUtils.parseDateOnly(String(b?.DatePrih ?? ''))?.getTime() ?? 0;
                                                return db - da;
                                            });
                                            return (
                                                <React.Fragment key={customerRow.customer}>
                                                    <tr
                                                        onClick={() => page.setExpandedCombinedLogisticsCustomer(expanded ? null : customerRow.customer)}
                                                        style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expanded ? 'var(--color-bg-card)' : undefined }}
                                                        title={expanded ? 'Свернуть перевозки' : 'Показать перевозки'}
                                                    >
                                                        <td style={{ padding: '0.4rem 0.45rem', color: 'var(--color-text-secondary)' }}>{idx + 1}</td>
                                                        <td className="customer-col" style={{ padding: '0.4rem 0.45rem', fontWeight: 600 }}>
                                                            {expanded ? <ArrowUp className="w-3 h-3" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} /> : <ArrowDown className="w-3 h-3" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />}
                                                            {stripOoo(customerRow.customer)}
                                                        </td>
                                                        <td style={{ padding: '0.4rem 0.45rem', textAlign: 'right' }}>{customerRow.count.toLocaleString('ru-RU')}</td>
                                                        <td style={{ padding: '0.4rem 0.45rem', textAlign: 'right' }}>{Math.round(customerRow.w).toLocaleString('ru-RU')}</td>
                                                        <td style={{ padding: '0.4rem 0.45rem', textAlign: 'right' }}>{customerRow.vol.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</td>
                                                        <td style={{ padding: '0.4rem 0.45rem', textAlign: 'right' }}>{Math.round(customerRow.pw).toLocaleString('ru-RU')}</td>
                                                        <td style={{ padding: '0.4rem 0.45rem', textAlign: 'right' }}>{Math.round(customerRow.mest).toLocaleString('ru-RU')}</td>
                                                        {page.showSums && <td style={{ padding: '0.4rem 0.45rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(customerRow.sum, true)}</td>}
                                                    </tr>
                                                    {expanded && (
                                                        <tr>
                                                            <td colSpan={page.showSums ? 8 : 7} style={{ padding: '0.45rem 0.55rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-primary)' }}>
                                                                <div style={{ overflowX: 'auto' }}>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                                                                        <thead>
                                                                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                                <th style={{ padding: '0.3rem', textAlign: 'left', fontWeight: 600 }}>Перевозка</th>
                                                                                <th style={{ padding: '0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                                                                                <th style={{ padding: '0.3rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                                                                <th style={{ padding: '0.3rem', textAlign: 'left', fontWeight: 600 }}>Маршрут</th>
                                                                                <th style={{ padding: '0.3rem', textAlign: 'right', fontWeight: 600 }}>Мест</th>
                                                                                <th style={{ padding: '0.3rem', textAlign: 'right', fontWeight: 600 }}>Плат. вес</th>
                                                                                <th style={{ padding: '0.3rem', textAlign: 'right', fontWeight: 600 }}>Объём</th>
                                                                                {page.showSums && <th style={{ padding: '0.3rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {sortedItems.map((item, itemIndex) => {
                                                                                const cargoNum = item.Number ? String(item.Number) : '';
                                                                                const leafOpen = cargoNum && page.onOpenCargo
                                                                                    ? leafRowClickProps(() => page.onOpenCargo(cargoNum, item), 'Открыть карточку перевозки')
                                                                                    : null;
                                                                                return (
                                                                                <tr key={`${item.Number ?? itemIndex}-${itemIndex}`} style={{ borderBottom: '1px solid var(--color-border)', ...(leafOpen?.style ?? {}) }} onClick={leafOpen?.onClick} title={leafOpen?.title}>
                                                                                    <td style={{ padding: '0.3rem' }}>
                                                                                        <ClickableCargoNumber number={cargoNum} onOpen={(n) => page.onOpenCargo?.(n, item)} />
                                                                                    </td>
                                                                                    <td style={{ padding: '0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                                                    <td style={{ padding: '0.3rem' }}>{normalizeStatus(item.State)}</td>
                                                                                    <td style={{ padding: '0.3rem' }}><RouteBadge route={getCargoItemRouteLabel(item)} /></td>
                                                                                    <td style={{ padding: '0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)).toLocaleString('ru-RU') : '—'}</td>
                                                                                    <td style={{ padding: '0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW)).toLocaleString('ru-RU')} кг` : '—'}</td>
                                                                                    <td style={{ padding: '0.3rem', textAlign: 'right' }}>{((item as any).Value ?? (item as any).Volume ?? (item as any).V) != null ? Number((item as any).Value ?? (item as any).Volume ?? (item as any).V).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—'}</td>
                                                                                    {page.showSums && <td style={{ padding: '0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(Number(item.Sum ?? 0), true)}</td>}
                                                                                </tr>
                                                                            );})}
                                                                        </tbody>
                                                                    </table>
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
                        </div>
                    )}
                </Panel>
            )}

        </>
    );
}
