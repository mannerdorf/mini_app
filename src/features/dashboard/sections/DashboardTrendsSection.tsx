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
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
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
                    <div ref={page.mainChartWrapRef} style={{ width: '100%', minWidth: 0 }}>
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
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
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
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        Тренд без дневных колебаний — {page.maChartType === 'money' ? 'выручка (₽)' : page.maChartType === 'paidWeight' ? 'платный вес (кг)' : page.maChartType === 'weight' ? 'вес (кг)' : page.maChartType === 'pieces' ? 'места (шт)' : 'объём (м³)'}
                    </Typography.Body>
                    {(() => {
                        const pts = page.movingAverage7;
                        const maxVal = Math.max(...pts.map((p) => p.value), 1);
                        const w = Math.max(280, Math.floor(page.maChartOuterWidthPx));
                        const h = 100;
                        const pad = { l: 50, r: 16, t: 10, b: 26 };
                        const plotW = w - pad.l - pad.r;
                        const plotH = h - pad.t - pad.b;
                        const polyPts = pts.map((p, i) => {
                            const x = pad.l + (pts.length > 1 ? (i * plotW) / (pts.length - 1) : plotW / 2);
                            const y = pad.t + plotH - (p.value / maxVal) * plotH;
                            return `${x},${y}`;
                        }).join(' ');
                        const areaD = pts.length > 1
                            ? `M ${pad.l} ${pad.t + plotH} L ${pts.map((p, i) => { const x = pad.l + (i * plotW) / (pts.length - 1); const y = pad.t + plotH - (p.value / maxVal) * plotH; return `${x} ${y}`; }).join(' L ')} L ${pad.l + plotW} ${pad.t + plotH} Z`
                            : '';
                        return (
                            <div ref={page.maChartWrapRef} style={{ width: '100%', minWidth: 0 }}>
                                <svg
                                    viewBox={`0 0 ${w} ${h}`}
                                    width="100%"
                                    height={h}
                                    preserveAspectRatio="xMinYMid meet"
                                    style={{ display: 'block', maxWidth: '100%' }}
                                >
                                    <line x1={pad.l} y1={pad.t + plotH} x2={w - pad.r} y2={pad.t + plotH} stroke="var(--color-border)" strokeWidth="1" opacity="0.5" />
                                    {areaD && <path d={areaD} fill="#7c3aed" opacity="0.12" />}
                                    <polyline points={polyPts} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    {pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 8)) === 0 || i === pts.length - 1).map((p, i) => {
                                        const idx = pts.indexOf(p);
                                        const x = pad.l + (pts.length > 1 ? (idx * plotW) / (pts.length - 1) : plotW / 2);
                                        const raw = String(p?.date ?? '').trim();
                                        const label = raw.includes('.') ? raw.split('.').slice(0, 2).join('.') : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(8) + '.' + raw.slice(5, 7) : raw;
                                        return <text key={`ma-lbl-${i}`} x={x} y={h - 6} textAnchor="middle" fontSize="9" fill="var(--color-text-secondary)">{label}</text>;
                                    })}
                                    <text x={pad.l - 4} y={pad.t + 4} textAnchor="end" fontSize="9" fill="var(--color-text-secondary)">{page.maChartType === 'money' ? formatCurrency(maxVal, true) : `${maxVal.toLocaleString('ru-RU')} ${page.maChartType === 'volume' ? 'м³' : page.maChartType === 'pieces' ? 'шт' : 'кг'}`}</text>
                                </svg>
                            </div>
                        );
                    })()}
                </Panel>
            )}

        </>
    );
}
