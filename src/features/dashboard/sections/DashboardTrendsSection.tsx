import React from "react";
import { Loader2, AlertTriangle, Package, Scale, Weight, List, RussianRuble } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { DashboardMainChart } from "../DashboardMainChart";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardTrendsSection({ page }: Props) {
    return (
        <>
{page.loading && !page.error && (
                <Flex justify="center" className="text-center py-8">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
                </Flex>
            )}
            
            {page.error && (
                <Flex align="center" className="login-page.error mt-4">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <Typography.Body>{page.error}</Typography.Body>
                </Flex>
            )}
            
            {/* ═══════ ГРУППА 1: ОБЗОР И ТРЕНДЫ ═══════ */}
            
            {/* === ВИДЖЕТ 3: График динамики (включить: page.WIDGET_3_CHART = true) === */}
            {page.WIDGET_3_CHART && !page.loading && !page.error && page.showSums && (
                <Panel className="cargo-card dashboard-dynamics-panel" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
                    <Flex align="center" justify="space-between" style={{ marginBottom: '0.15rem' }}>
                        <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600 }}>
                            {page.selectedChartConfig.title}
                        </Typography.Headline>
                        <Flex gap="0.2rem" align="center">
                            {page.showSums && (
                                <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: page.chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            )}
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: page.chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: page.chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: page.chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setChartType('pieces')} title="Места (шт)"><Package className="w-4 h-4" style={{ color: page.chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        </Flex>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                        Динамика показателя по дням за выбранный период.
                    </Typography.Body>
                    <div ref={page.mainChartWrapRef} className="dashboard-main-chart-wrap">
                        <DashboardMainChart
                            data={page.selectedChartConfig.data}
                            title={page.selectedChartConfig.title}
                            color={page.selectedChartConfig.color}
                            formatValue={page.selectedChartConfig.formatValue}
                            variant="area"
                            outerWidthPx={page.mainChartOuterWidthPx}
                            onQuickDateFilter={page.setDateFilter}
                        />
                    </div>
                </Panel>
            )}

            {/* 7. Скользящая средняя (overlay на основной график) */}
            {page.useServiceRequest && !page.loading && !page.error && page.movingAverage7 && page.movingAverage7.length > 2 && !page.showOnlySla && (
                <Panel className="cargo-card dashboard-dynamics-panel" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
                    <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                        <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600 }}>
                            Скользящая средняя (7 дн.)
                        </Typography.Headline>
                        <Flex gap="0.2rem" align="center">
                            {page.showSums && (
                                <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.maChartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setMaChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: page.maChartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            )}
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.maChartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setMaChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: page.maChartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.maChartType === 'weight' ? '#0d9488' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setMaChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: page.maChartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.maChartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setMaChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: page.maChartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                            <Button className="filter-button" style={{ padding: '0.3rem', minWidth: 'auto', background: page.maChartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none', borderRadius: 8 }} onClick={() => page.setMaChartType('pieces')} title="Места (шт)"><Package className="w-4 h-4" style={{ color: page.maChartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        </Flex>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                        Тренд без дневных колебаний — {page.maChartType === 'money' ? 'выручка (₽)' : page.maChartType === 'paidWeight' ? 'платный вес (кг)' : page.maChartType === 'weight' ? 'вес (кг)' : page.maChartType === 'pieces' ? 'места (шт)' : 'объём (м³)'}
                    </Typography.Body>
                    {(() => {
                        const pts = page.movingAverage7;
                        const maxVal = Math.max(...pts.map((p) => p.value), 1);
                        const chartWidth = Math.max(280, Math.floor(page.maChartOuterWidthPx));
                        const chartHeight = 110;
                        const paddingTop = 6;
                        const paddingBottom = 6;
                        const plotH = chartHeight - paddingTop - paddingBottom;
                        const baselineY = chartHeight - paddingBottom;
                        const n = pts.length;
                        const polyPts = pts.map((p, i) => {
                            const x = n <= 1 ? chartWidth / 2 : (i / (n - 1)) * chartWidth;
                            const y = baselineY - (p.value / maxVal) * plotH;
                            return `${x},${y}`;
                        }).join(' ');
                        const areaD = n > 1
                            ? `M 0 ${baselineY} L ${pts.map((p, i) => {
                                const x = (i / (n - 1)) * chartWidth;
                                const y = baselineY - (p.value / maxVal) * plotH;
                                return `${x} ${y}`;
                            }).join(' L ')} L ${chartWidth} ${baselineY} Z`
                            : '';
                        return (
                            <div ref={page.maChartWrapRef} className="dashboard-main-chart-wrap">
                                <div className="dashboard-main-chart">
                                    <svg
                                        className="dashboard-main-chart__svg"
                                        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                                        width="100%"
                                        height={chartHeight}
                                        preserveAspectRatio="none"
                                        aria-hidden
                                    >
                                        {areaD && <path d={areaD} fill="#7c3aed" opacity="0.12" />}
                                        <polyline
                                            points={polyPts}
                                            fill="none"
                                            stroke="#7c3aed"
                                            strokeWidth="2.2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            vectorEffect="non-scaling-stroke"
                                        />
                                    </svg>
                                </div>
                            </div>
                        );
                    })()}
                </Panel>
            )}

        </>
    );
}
