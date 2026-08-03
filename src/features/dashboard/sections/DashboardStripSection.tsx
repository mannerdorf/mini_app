import React from "react";
import { Loader2, Package, Scale, Weight, List, RussianRuble } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { DateText } from "../../../components/ui/DateText";
import { formatCurrency } from "../../../lib/formatUtils";
import { DashboardMetricsStrip } from "../widgets/DashboardMetricsStrip";
import { DashboardChartBarH, DashboardMotionItem } from "../index";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardStripSection({ page }: Props) {
    return (
        <>
            {page.WIDGET_2_STRIP && page.showSums && (
            <DashboardMotionItem enabled={page.dashboardMotionEnabled}>
            <>
            <DashboardMetricsStrip
                showSums={page.showSums}
                useServiceRequest={page.useServiceRequest}
                apiDateRange={page.apiDateRange}
                comparePeriodRange={page.comparePeriodRange}
                comparePeriodOverride={!!page.comparePeriodOverride}
                prevPeriodLoading={page.prevPeriodLoading}
                onOpenComparePeriod={() => page.setIsComparePeriodDialogOpen(true)}
                chartType={page.chartType}
                setChartType={page.setChartType}
                dateFilter={page.dateFilter}
                stripValueLabel={page.formatStripValue()}
                periodToPeriodTrend={page.periodToPeriodTrend}
                stripTrend={page.stripTrend}
                chartDataLength={page.chartData.length}
                stripTab={page.stripTab}
                setStripTab={page.setStripTab}
                stripDiagramByType={page.stripDiagramByType}
                stripDiagramBySender={page.stripDiagramBySender}
                stripDiagramByReceiver={page.stripDiagramByReceiver}
                stripDiagramByCustomer={page.stripDiagramByCustomer}
                stripShowAsPercent={page.stripShowAsPercent}
                setStripShowAsPercent={page.setStripShowAsPercent}
                formatStripDelta={page.formatStripDelta}
                stripLineChartData={page.stripLineChartData}
                chartBarFillEnabled={page.chartBarFillEnabled}
            />

            {/* Монитор доставки: только статус «доставлено» в выбранном периоде (только в служебном режиме, без заказчика). Пока скрыт. */}
            {false && page.useServiceRequest && (
            <>
            <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.35rem', marginTop: '0.5rem' }}>Доставка</Typography.Body>
            <div className="home-strip" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', marginBottom: '1rem', overflow: 'hidden' }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.75rem 1rem', minWidth: 0 }}>
                    <Typography.Body style={{ color: 'var(--color-primary-blue)', fontWeight: 600, fontSize: '0.6rem' }}>
                        <DateText value={page.apiDateRange.dateFrom} /> – <DateText value={page.apiDateRange.dateTo} /> — Доставлено
                    </Typography.Body>
                    <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }}>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: page.chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none' }} onClick={() => page.setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: page.chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: page.chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none' }} onClick={() => page.setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: page.chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: page.chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none' }} onClick={() => page.setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: page.chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: page.chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none' }} onClick={() => page.setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: page.chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: page.chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none' }} onClick={() => page.setChartType('pieces')} title="Шт"><Package className="w-4 h-4" style={{ color: page.chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    </Flex>
                </div>
                <div style={{ padding: '1.25rem 1rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                    <Flex align="center" gap="0.5rem" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem' }}>
                            {page.chartType === 'money' ? `${Math.round(page.deliveryStripTotals.sum || 0).toLocaleString('ru-RU')} ₽` : page.chartType === 'paidWeight' || page.chartType === 'weight' ? `${Math.round(page.deliveryStripTotals.pw || 0).toLocaleString('ru-RU')} кг` : page.chartType === 'pieces' ? `${Math.round(page.deliveryStripTotals.mest || 0).toLocaleString('ru-RU')} шт` : `${(page.deliveryStripTotals.vol || 0).toFixed(2).replace('.', ',')} м³`}
                        </Typography.Body>
                    </Flex>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <Flex gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                            {(['type', 'sender', 'receiver'] as const).map((tab) => (
                                <Button key={tab} className="filter-button" style={{ flexShrink: 0, padding: '0.5rem 0.75rem', background: page.deliveryStripTab === tab ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)', color: page.deliveryStripTab === tab ? 'white' : 'var(--color-text-primary)', border: page.deliveryStripTab === tab ? '1px solid var(--color-primary-blue)' : '1px solid var(--color-border)' }} onClick={() => page.setDeliveryStripTab(tab)}>
                                    {tab === 'type' ? 'Тип' : tab === 'sender' ? 'Отправитель' : 'Получатель'}
                                </Button>
                            ))}
                        </Flex>
                    </div>
                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        {page.deliveryStripTab === 'type' && page.deliveryStripDiagramByType.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, width: 140 }}>{row.label}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); page.setDeliveryStripShowAsPercent(p => !p); }} title={page.deliveryStripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах'}>
                                    {page.deliveryStripShowAsPercent ? `${row.percent}%` : (page.chartType === 'money' ? formatCurrency(row.value, true) : page.chartType === 'paidWeight' || page.chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : page.chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                        {page.deliveryStripTab === 'sender' && page.deliveryStripDiagramBySender.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); page.setDeliveryStripShowAsPercent(p => !p); }}>
                                    {page.deliveryStripShowAsPercent ? `${row.percent}%` : (page.chartType === 'money' ? formatCurrency(row.value, true) : page.chartType === 'paidWeight' || page.chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : page.chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                        {page.deliveryStripTab === 'receiver' && page.deliveryStripDiagramByReceiver.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={row.percent} delay={i * 0.045} style={{ background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); page.setDeliveryStripShowAsPercent(p => !p); }}>
                                    {page.deliveryStripShowAsPercent ? `${row.percent}%` : (page.chartType === 'money' ? formatCurrency(row.value, true) : page.chartType === 'paidWeight' || page.chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : page.chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            </>
            )}
            </>
            </DashboardMotionItem>
            )}
        </>
    );
}
