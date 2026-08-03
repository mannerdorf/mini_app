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
import { DashboardCargoFlowWidget } from "../widgets/DashboardCargoFlowWidget";
import {
    DASH_PLAN_FACT_TYPO,
    DashboardChartBarH,
    DashboardChartBarPixelHeight,
    CHART_BAR_FILL_DURATION,
    CHART_BAR_FILL_EASE,
} from "../index";
import type { CargoItem } from "../../../types";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

const { formatDate } = dateUtils;

type Props = { page: DashboardPageState };

export function DashboardOperationsLateSection({ page }: Props) {
    return (
        <>
{/* 6. Календарь загрузки (heatmap) */}
            {page.useServiceRequest && !page.loading && !page.error && page.loadHeatmap.cells.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Flex align="center" justify="space-between" style={{ marginBottom: '0.15rem' }}>
                        <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600 }}>
                            Календарь загрузки
                        </Typography.Headline>
                        <Flex align="center" gap="0.4rem">
                            {(() => {
                                const canPrev = page.heatmapMonth.year > page.heatmapRange.minYear || (page.heatmapMonth.year === page.heatmapRange.minYear && page.heatmapMonth.month > page.heatmapRange.minMonth);
                                const canNext = page.heatmapMonth.year < page.heatmapRange.maxYear || (page.heatmapMonth.year === page.heatmapRange.maxYear && page.heatmapMonth.month < page.heatmapRange.maxMonth);
                                return (
                                    <>
                                        <Button className="filter-button" style={{ padding: '0.25rem 0.45rem', fontSize: '0.8rem', opacity: canPrev ? 1 : 0.3 }} disabled={!canPrev} onClick={() => canPrev && page.setHeatmapMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))}>←</Button>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.82rem', minWidth: '8rem', textAlign: 'center' }}>
                                            {['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][page.loadHeatmap.month - 1]} {page.loadHeatmap.year}
                                        </Typography.Body>
                                        <Button className="filter-button" style={{ padding: '0.25rem 0.45rem', fontSize: '0.8rem', opacity: canNext ? 1 : 0.3 }} disabled={!canNext} onClick={() => canNext && page.setHeatmapMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))}>→</Button>
                                    </>
                                );
                    })()}
                        </Flex>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>
                        Интенсивность приёмок по дням месяца. Чем ярче ячейка — тем больше грузов принято в этот день.
                    </Typography.Body>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((wd) => (
                            <div key={`hm-h-${wd}`} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontWeight: 600, padding: '0.15rem' }}>{wd}</div>
                        ))}
                        {(() => {
                            const first = new Date(page.loadHeatmap.year, page.loadHeatmap.month - 1, 1);
                            const offset = (first.getDay() + 6) % 7;
                            const blanks = Array.from({ length: offset }, (_, i) => (
                                <div key={`hm-blank-${i}`} />
                            ));
                            const days = page.loadHeatmap.cells.map((cell) => {
                                const intensity = cell.count / page.loadHeatmap.maxCount;
                                return (
                                    <div key={`hm-${cell.key}`} title={`${cell.key}: ${cell.count} грузов, ${Math.round(cell.pw)} кг`} style={{ textAlign: 'center', borderRadius: 5, padding: '0.3rem 0.15rem', fontSize: '0.72rem', fontWeight: cell.count > 0 ? 600 : 400, background: cell.count > 0 ? `rgba(37,99,235,${0.12 + intensity * 0.55})` : 'var(--color-bg-hover)', color: intensity > 0.5 ? 'white' : 'var(--color-text-primary)', cursor: 'default' }}>
                                        {cell.day}
                                        {cell.count > 0 && <div style={{ fontSize: '0.6rem', fontWeight: 400, opacity: 0.85 }}>{cell.count}</div>}
                                    </div>
                                );
                            });
                            return [...blanks, ...days];
                        })()}
                    </div>
                </Panel>
            )}

            {/* 1. Воронка статусов */}
            {page.useServiceRequest && !page.loading && !page.error && page.statusFunnel.length > 0 && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.15rem' }}>
                        Воронка статусов
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.45rem' }}>
                        Распределение грузов по этапам обработки: от приёмки до доставки получателю.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {(() => {
                            const maxC = Math.max(...page.statusFunnel.map((s) => s.count), 1);
                            const totalC = page.statusFunnel.reduce((a, s) => a + s.count, 0) || 1;
                            return page.statusFunnel.map((stage, fi) => {
                                const isActive = page.selectedFunnelStatusKey === stage.key;
                                return (
                                    <button
                                        key={stage.key}
                                        type="button"
                                        onClick={() => { page.setSelectedFunnelStatusKey((prev) => (prev === stage.key ? null : stage.key)); page.setExpandedFunnelCustomer(null); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isActive ? 'var(--color-bg-hover)' : 'transparent', border: isActive ? '1px solid var(--color-border)' : '1px solid transparent', borderRadius: 8, padding: '0.2rem 0.25rem', cursor: 'pointer', textAlign: 'left' }}
                                        title="Показать список заказчиков по статусу"
                                    >
                                        <Typography.Body style={{ fontSize: '0.78rem', width: 110, flexShrink: 0, color: 'var(--color-text-secondary)' }}>{stage.label}</Typography.Body>
                                        <div style={{ flex: 1, height: 14, borderRadius: 7, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={Math.round((stage.count / maxC) * 100)} delay={fi * 0.04} style={{ background: stage.color, borderRadius: 7 }} />
                                        </div>
                                        <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: 44, textAlign: 'right' }}>{stage.count}</Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', minWidth: 36, textAlign: 'right' }}>{Math.round((stage.count / totalC) * 100)}%</Typography.Body>
                                    </button>
                                );
                            });
                        })()}
                    </div>
                    {page.selectedFunnelStatusKey && (
                        <div style={{ marginTop: '0.55rem', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.55rem', background: 'var(--color-bg-hover)' }}>
                            <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                                Заказчики по статусу: {page.statusFunnel.find((s) => s.key === page.selectedFunnelStatusKey)?.label || page.selectedFunnelStatusKey}. Нажмите на заказчика — перевозки и даты.
                            </Typography.Body>
                            <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'left', fontWeight: 600, width: 24 }}>#</th>
                                            <th className="customer-col" style={{ padding: '0.4rem 0.45rem', textAlign: 'left', fontWeight: 600 }}>Заказчик</th>
                                            <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600 }}>Кол-во</th>
                                            {page.showSums && <th style={{ padding: '0.4rem 0.45rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>Сумма</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(page.statusFunnelCustomersTable[page.selectedFunnelStatusKey] ?? []).map((row, idx) => {
                                            const isExpanded = page.expandedFunnelCustomer === row.customer;
                                            const items = (page.statusFunnelItemsByCustomer[page.selectedFunnelStatusKey] ?? {})[row.customer] ?? [];
                                            const sortedItems = [...items].sort((a, b) => {
                                                const da = dateUtils.parseDateOnly(String(a?.DatePrih ?? a?.DateOtpr ?? ''))?.getTime() ?? 0;
                                                const db = dateUtils.parseDateOnly(String(b?.DatePrih ?? b?.DateOtpr ?? ''))?.getTime() ?? 0;
                                                return db - da;
                                            });
                                            return (
                                                <React.Fragment key={row.customer}>
                                                    <tr
                                                        onClick={() => page.setExpandedFunnelCustomer(isExpanded ? null : row.customer)}
                                                        style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: isExpanded ? 'var(--color-bg-card)' : undefined }}
                                                        title="Нажмите, чтобы показать перевозки"
                                                    >
                                                        <td style={{ padding: '0.35rem 0.45rem', color: 'var(--color-text-secondary)' }}>{idx + 1}</td>
                                                        <td className="customer-col" style={{ padding: '0.35rem 0.45rem' }}>{row.customer}{isExpanded ? ' ▼' : ' ▶'}</td>
                                                        <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right' }}>{row.count}</td>
                                                        {page.showSums && <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(row.sum)}</td>}
                                                    </tr>
                                                    {isExpanded && sortedItems.length > 0 && (
                                                        <tr>
                                                            <td colSpan={page.showSums ? 4 : 3} style={{ padding: '0.35rem 0.45rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)', verticalAlign: 'top' }}>
                                                                <div style={{ fontSize: '0.72rem', paddingLeft: '0.5rem' }}>
                                                                    <Typography.Body style={{ fontSize: '0.68rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--color-text-secondary)' }}>Перевозки и даты</Typography.Body>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                                                                        <thead>
                                                                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                                <th style={{ padding: '0.2rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Перевозка</th>
                                                                                <th style={{ padding: '0.2rem 0.3rem', textAlign: 'center', fontWeight: 600 }}>Тип</th>
                                                                                <th style={{ padding: '0.2rem 0.3rem', textAlign: 'center', fontWeight: 600 }}>Маршрут</th>
                                                                                <th style={{ padding: '0.2rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата</th>
                                                                                <th style={{ padding: '0.2rem 0.3rem', textAlign: 'left', fontWeight: 600, lineHeight: 1.15 }}>Плановая дата прибытия<br />на терминал</th>
                                                                                {page.showSums && <th style={{ padding: '0.2rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {sortedItems.map((it, i) => {
                                                                                const cargoNum = String(it?.Number ?? it?.Номер ?? '').trim();
                                                                                const plannedDate = page.getEffectivePlannedDate(it);
                                                                                const plannedDateValue = plannedDate
                                                                                    ? `${plannedDate.getFullYear()}-${String(plannedDate.getMonth() + 1).padStart(2, '0')}-${String(plannedDate.getDate()).padStart(2, '0')}`
                                                                                    : '';
                                                                                return (
                                                                                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                                                                                    <td style={{ padding: '0.2rem 0.3rem' }}>
                                                                                        <ClickableCargoNumber number={cargoNum} onOpen={(n) => page.onOpenCargo?.(n, it as CargoItem)} />
                                                                                    </td>
                                                                                    <td style={{ padding: '0.2rem 0.3rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                                        <CargoTransportTypeIcon item={it as CargoItem} size={12} className="w-3 h-3" />
                                                                                    </td>
                                                                                    <td style={{ padding: '0.2rem 0.3rem', textAlign: 'center' }}>
                                                                                        <RouteBadge route={getCargoItemRouteLabel(it)} />
                                                                                    </td>
                                                                                    <td style={{ padding: '0.2rem 0.3rem' }}>
                                                                                        <DateText value={String(it?.DatePrih ?? it?.DateOtpr ?? it?.Дата ?? '').trim()} />
                                                                                    </td>
                                                                                    <td style={{ padding: '0.2rem 0.3rem', whiteSpace: 'nowrap' }}>
                                                                                        {plannedDateValue ? <DateText value={plannedDateValue} /> : '—'}
                                                                                    </td>
                                                                                    {page.showSums && <td style={{ padding: '0.2rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{it?.Sum != null ? formatCurrency(it.Sum as number, true) : '—'}</td>}
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
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </Panel>
            )}

            {/* ═══════ ГРУППА 3: ЛОГИСТИКА И СРОКИ ═══════ */}

                        {!page.showOnlySla && !page.loading && !page.error && (
                <DashboardCargoFlowWidget
                    cargoFlowByPlan={page.cargoFlowByPlan}
                    cargoFlowTableExpanded={page.cargoFlowTableExpanded}
                    cargoFlowTableSelection={page.cargoFlowTableSelection}
                    onCargoFlowPick={page.onCargoFlowPick}
                    onCollapseCargoFlow={() => { page.setCargoFlowTableExpanded(false); page.setCargoFlowTableSelection(null); }}
                    cargoFlowDetailSorted={page.cargoFlowDetailSorted}
                    showSums={page.showSums}
                    onOpenCargo={page.onOpenCargo}
                    getItemSum={page.getItemSum}
                    getEffectivePlannedDate={page.getEffectivePlannedDate}
                    getLastStatusDateKey={page.getLastStatusDateKey}
                />
            )}
        </>
    );
}
