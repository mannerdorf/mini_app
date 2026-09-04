import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { getFilterKeyByStatus, STATUS_MAP } from "../../../lib/statusUtils";
import { formatCurrency } from "../../../lib/formatUtils";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { RouteBadge, CargoTransportTypeIcon, getCargoItemRouteLabel } from "../../../components/shared/CargoTableDisplay";
import { DateText } from "../../../components/ui/DateText";
import { DASH_PLAN_FACT_TYPO } from "../dashboardConstants";
import { cargoFlowSelectionEqual, type CargoFlowTableSelection } from "../dashboardTypes";
import type { CargoItem } from "../../../types";

export type DashboardCargoFlowByPlan = {
    total: number;
    withPlan: number;
    withoutPlan: number;
    overdue: number;
    dueToday: number;
    dueTomorrow: number;
    dueNext7: number;
    deliveredOnTime: number;
    deliveredLate: number;
    upcomingSeries: {
        key: string;
        count: number;
        pw: number;
        mest: number;
        vol: number;
        ferry: { count: number; pw: number; mest: number; vol: number };
        auto: { count: number; pw: number; mest: number; vol: number };
        air: { count: number; pw: number; mest: number; vol: number };
    }[];
};

export type DashboardCargoFlowWidgetProps = {
    cargoFlowByPlan: DashboardCargoFlowByPlan;
    cargoFlowTableExpanded: boolean;
    cargoFlowTableSelection: CargoFlowTableSelection | null;
    onCargoFlowPick: (sel: CargoFlowTableSelection) => void;
    onCollapseCargoFlow: () => void;
    cargoFlowDetailSorted: CargoItem[];
    showSums: boolean;
    onOpenCargo?: (cargoNumber: string, prefetchedItem?: CargoItem) => void;
    getItemSum: (item: CargoItem) => number;
    getEffectivePlannedDate: (item: CargoItem) => Date | null;
    getLastStatusDateKey: (item: CargoItem) => string;
};

export function DashboardCargoFlowWidget({
    cargoFlowByPlan,
    cargoFlowTableExpanded,
    cargoFlowTableSelection,
    onCargoFlowPick,
    onCollapseCargoFlow,
    cargoFlowDetailSorted,
    showSums,
    onOpenCargo,
    getItemSum,
    getEffectivePlannedDate,
    getLastStatusDateKey,
}: DashboardCargoFlowWidgetProps) {
    const badges = [
        { badge: 'withPlan' as const, label: `С планом: ${cargoFlowByPlan.withPlan} из ${cargoFlowByPlan.total}`, bg: 'rgba(37,99,235,0.14)', border: '1px solid rgba(37,99,235,0.35)' },
        { badge: 'overdue' as const, label: `Просрочено: ${cargoFlowByPlan.overdue}`, bg: cargoFlowByPlan.overdue > 0 ? 'rgba(239,68,68,0.16)' : 'rgba(148,163,184,0.16)', border: cargoFlowByPlan.overdue > 0 ? '1px solid rgba(239,68,68,0.35)' : '1px solid var(--color-border)' },
        { badge: 'dueToday' as const, label: `Сегодня: ${cargoFlowByPlan.dueToday}`, bg: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.35)' },
        { badge: 'dueTomorrow' as const, label: `Завтра: ${cargoFlowByPlan.dueTomorrow}`, bg: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.35)' },
        { badge: 'dueNext7' as const, label: `2-7 дней: ${cargoFlowByPlan.dueNext7}`, bg: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.35)' },
        { badge: 'withoutPlan' as const, label: `Без плановой: ${cargoFlowByPlan.withoutPlan}`, bg: 'rgba(148,163,184,0.16)', border: '1px solid var(--color-border)' },
    ];

    return (
        <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
            <Typography.Headline style={DASH_PLAN_FACT_TYPO.title}>
                Грузовой поток (по плановой дате прибытия на терминал)
            </Typography.Headline>
            <Typography.Body style={DASH_PLAN_FACT_TYPO.desc}>
                Поток перевозок по плановой дате прибытия на терминал: нагрузка на ближайшие дни и риск просрочки. Нажмите на бейдж или день — ниже откроется таблица; повторный клик по тому же элементу сворачивает её.
            </Typography.Body>
            <Flex gap="0.55rem" wrap="wrap" style={{ marginBottom: '0.8rem' }}>
                {badges.map((b) => {
                    const sel = { kind: 'badge' as const, badge: b.badge };
                    const active = cargoFlowTableExpanded && cargoFlowSelectionEqual(cargoFlowTableSelection, sel);
                    return (
                        <button
                            key={b.badge}
                            type="button"
                            className="role-badge"
                            onClick={() => onCargoFlowPick(sel)}
                            style={{
                                ...DASH_PLAN_FACT_TYPO.badge,
                                background: active ? `${b.bg.replace('0.14', '0.22').replace('0.16', '0.24')}` : b.bg,
                                border: active ? '2px solid rgba(255,255,255,0.35)' : b.border,
                                cursor: 'pointer',
                                color: 'inherit',
                                boxShadow: active ? '0 0 0 2px rgba(37,99,235,0.25)' : undefined,
                            }}
                        >
                            {b.label}
                        </button>
                    );
                })}
            </Flex>
            <div style={{ marginTop: '0.35rem' }}>
                <Typography.Body style={DASH_PLAN_FACT_TYPO.subhead}>
                    Ближайшие 7 дней (плановое прибытие на терминал)
                </Typography.Body>
                <div className="dashboard-cargo-flow-days-wrap dashboard-cargo-flow-days-wrap--scroll">
                    <div className="dashboard-cargo-flow-days-grid">
                        {cargoFlowByPlan.upcomingSeries.map((row) => {
                            const tileSel = { kind: 'tile' as const, dateKey: row.key };
                            const tileActive = cargoFlowTableExpanded && cargoFlowSelectionEqual(cargoFlowTableSelection, tileSel);
                            return (
                                <button
                                    key={`cargo-flow-${row.key}`}
                                    type="button"
                                    onClick={() => onCargoFlowPick(tileSel)}
                                    style={{
                                        ...DASH_PLAN_FACT_TYPO.tile,
                                        border: tileActive ? '2px solid rgba(37,99,235,0.65)' : DASH_PLAN_FACT_TYPO.tile.border,
                                        background: row.count > 0 ? 'rgba(37,99,235,0.05)' : DASH_PLAN_FACT_TYPO.tile.background,
                                        cursor: 'pointer',
                                        color: 'inherit',
                                        textAlign: 'left',
                                        boxSizing: 'border-box',
                                    }}
                                >
                                    <Typography.Body style={DASH_PLAN_FACT_TYPO.tileDate}>
                                        <DateText value={row.key} />
                                    </Typography.Body>
                                    <Typography.Body style={DASH_PLAN_FACT_TYPO.tileLine}>Всего: {row.count}</Typography.Body>
                                    <Typography.Body style={{ ...DASH_PLAN_FACT_TYPO.tileLine, color: '#2563eb' }}>Паром: {row.ferry.count}</Typography.Body>
                                    <Typography.Body style={{ ...DASH_PLAN_FACT_TYPO.tileLine, color: '#16a34a' }}>Авто: {row.auto.count}</Typography.Body>
                                    <Typography.Body style={{ ...DASH_PLAN_FACT_TYPO.tileLine, color: '#6366f1' }}>Авиа: {row.air?.count ?? 0}</Typography.Body>
                                    <Typography.Body style={{ ...DASH_PLAN_FACT_TYPO.tileLine, color: 'var(--color-text-secondary)' }}>Мест: {Math.round(row.mest).toLocaleString('ru-RU')}</Typography.Body>
                                    <Typography.Body style={{ ...DASH_PLAN_FACT_TYPO.tileLine, color: 'var(--color-text-secondary)' }}>Вес: {Math.round(row.pw).toLocaleString('ru-RU')} кг</Typography.Body>
                                    <Typography.Body style={{ ...DASH_PLAN_FACT_TYPO.tileLine, color: 'var(--color-text-secondary)' }}>Объём: {row.vol.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} м³</Typography.Body>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
            {cargoFlowTableExpanded && cargoFlowTableSelection && (
                <div style={{ marginTop: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.55rem', background: 'var(--color-bg-hover)' }}>
                    <Flex align="center" justify="space-between" gap="0.5rem" wrap="wrap" style={{ marginBottom: '0.45rem' }}>
                        <Typography.Body style={DASH_PLAN_FACT_TYPO.subhead}>
                            {cargoFlowTableSelection.kind === 'tile' ? (
                                <>Плановое прибытие на терминал, <DateText value={cargoFlowTableSelection.dateKey} /> (<b>{cargoFlowDetailSorted.length}</b>)</>
                            ) : (
                                <>
                                    {cargoFlowTableSelection.badge === 'withPlan' && <>Все с плановой датой прибытия на терминал (<b>{cargoFlowDetailSorted.length}</b>)</>}
                                    {cargoFlowTableSelection.badge === 'withoutPlan' && <>Без плановой даты прибытия на терминал (<b>{cargoFlowDetailSorted.length}</b>)</>}
                                    {cargoFlowTableSelection.badge === 'overdue' && <>Просрочено (<b>{cargoFlowDetailSorted.length}</b>)</>}
                                    {cargoFlowTableSelection.badge === 'dueToday' && <>Срок сегодня (<b>{cargoFlowDetailSorted.length}</b>)</>}
                                    {cargoFlowTableSelection.badge === 'dueTomorrow' && <>Срок завтра (<b>{cargoFlowDetailSorted.length}</b>)</>}
                                    {cargoFlowTableSelection.badge === 'dueNext7' && <>Через 2–7 дней (<b>{cargoFlowDetailSorted.length}</b>)</>}
                                </>
                            )}
                        </Typography.Body>
                        <Button type="button" className="filter-button" style={{ ...DASH_PLAN_FACT_TYPO.badge, padding: '0.25rem 0.5rem' }} onClick={onCollapseCargoFlow}>
                            Свернуть
                        </Button>
                    </Flex>
                    <div className="dashboard-scroll-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                        <table className="dashboard-scroll-table" style={{ width: '100%', borderCollapse: 'collapse', ...DASH_PLAN_FACT_TYPO.table }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                                    <th style={{ ...DASH_PLAN_FACT_TYPO.tableTh, textAlign: 'left' }}>Перевозка</th>
                                    <th style={{ ...DASH_PLAN_FACT_TYPO.tableTh, textAlign: 'left' }}>План</th>
                                    <th style={{ ...DASH_PLAN_FACT_TYPO.tableTh, textAlign: 'left' }}>Дата статуса</th>
                                    <th style={{ ...DASH_PLAN_FACT_TYPO.tableTh, textAlign: 'center' }}>Статус</th>
                                    <th style={{ ...DASH_PLAN_FACT_TYPO.tableTh, textAlign: 'left' }}>Маршрут</th>
                                    <th style={{ ...DASH_PLAN_FACT_TYPO.tableTh, textAlign: 'center' }}>Тип</th>
                                    {showSums && <th style={{ ...DASH_PLAN_FACT_TYPO.tableTh, textAlign: 'right' }}>Сумма</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {cargoFlowDetailSorted.length === 0 ? (
                                    <tr className="dashboard-scroll-table__empty-row">
                                        <td colSpan={showSums ? 7 : 6} style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>
                                            Нет перевозок по этому фильтру.
                                        </td>
                                    </tr>
                                ) : (
                                    cargoFlowDetailSorted.map((item, idx) => {
                                        const cargoNum = String(item.Number ?? (item as any).Номер ?? '').trim();
                                        const planD = getEffectivePlannedDate(item);
                                        const planKey = planD
                                            ? `${planD.getFullYear()}-${String(planD.getMonth() + 1).padStart(2, '0')}-${String(planD.getDate()).padStart(2, '0')}`
                                            : '';
                                        const statusDateKey = getLastStatusDateKey(item);
                                        const sk = getFilterKeyByStatus(item.State);
                                        const stLabel = STATUS_MAP[sk] ?? (String(item.State ?? '').trim() || '—');
                                        const stColor =
                                            sk === 'delivered' ? '#10b981'
                                                : sk === 'delivering' ? '#f59e0b'
                                                    : sk === 'ready' ? '#8b5cf6'
                                                        : sk === 'in_transit' ? '#3b82f6'
                                                            : '#94a3b8';
                                        return (
                                            <tr key={`cargo-flow-row-${cargoNum || idx}-${idx}`} className="dashboard-scroll-table__data-row" style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td data-label="Перевозка" style={{ padding: '0.35rem 0.45rem', whiteSpace: 'nowrap' }}>
                                                    <ClickableCargoNumber number={cargoNum} onOpen={(n) => onOpenCargo?.(n, item)} />
                                                </td>
                                                <td data-label="План" style={{ padding: '0.35rem 0.45rem', whiteSpace: 'nowrap' }}>
                                                    {planKey ? <DateText value={planKey} /> : '—'}
                                                </td>
                                                <td data-label="Дата статуса" style={{ padding: '0.35rem 0.45rem', whiteSpace: 'nowrap' }}>
                                                    {statusDateKey ? <DateText value={statusDateKey} /> : '—'}
                                                </td>
                                                <td data-label="Статус" style={{ padding: '0.35rem 0.45rem', textAlign: 'center' }}>
                                                    <span style={{ ...DASH_PLAN_FACT_TYPO.statusPill, background: `${stColor}18`, color: stColor, border: `1px solid ${stColor}44` }}>
                                                        {stLabel}
                                                    </span>
                                                </td>
                                                <td data-label="Маршрут" style={{ padding: '0.35rem 0.45rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    <RouteBadge route={getCargoItemRouteLabel(item)} />
                                                </td>
                                                <td data-label="Тип" style={{ padding: '0.35rem 0.45rem', textAlign: 'center' }}>
                                                    <CargoTransportTypeIcon item={item} />
                                                </td>
                                                {showSums && (
                                                    <td data-label="Сумма" style={{ padding: '0.35rem 0.45rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatCurrency(getItemSum(item), true)}</td>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {(cargoFlowByPlan.deliveredOnTime + cargoFlowByPlan.deliveredLate) > 0 && (
                <Typography.Body style={{ ...DASH_PLAN_FACT_TYPO.meta, marginTop: '0.6rem' }}>
                    Доставлено: в срок {cargoFlowByPlan.deliveredOnTime}, с опозданием {cargoFlowByPlan.deliveredLate}.
                </Typography.Body>
            )}
        </Panel>
    );
}
