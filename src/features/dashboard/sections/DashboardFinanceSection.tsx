import React from "react";
import { Loader2, RefreshCw, ArrowDown, ArrowUp, TrendingUp, TrendingDown } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { formatCurrency, stripOoo, normalizeInvoiceStatus } from "../../../lib/formatUtils";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { DateText } from "../../../components/ui/DateText";
import type { DashboardPageState } from "../../../pages/useDashboardPageState";

type Props = { page: DashboardPageState };

export function DashboardFinanceSection({ page }: Props) {
    return (
        <>
{/* ═══════ ГРУППА 4: ФИНАНСЫ И КЛИЕНТЫ ═══════ */}

            {/* === ВИДЖЕТ 5: Платёжный календарь (включить: page.WIDGET_5_PAYMENT_CALENDAR = true) === */}
            {page.WIDGET_5_PAYMENT_CALENDAR && page.showPaymentCalendar && !page.loading && !page.error && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Платёжный календарь</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        Рекомендуемые дни оплаты выставленных и неоплаченных счетов
                    </Typography.Body>
                    {page.paymentCalendarLoading ? (
                        <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка условий оплаты...</Typography.Body></Flex>
                    ) : (
                        <>
                            <Flex align="center" gap="0.5rem" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem' }} onClick={() => page.setPaymentCalendarMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))}>←</Button>
                                <Typography.Body style={{ fontWeight: 600, minWidth: '10rem', textAlign: 'center' }}>
                                    {['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][paymentCalendarMonth.month - 1]} {paymentCalendarMonth.year}
                                </Typography.Body>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem' }} onClick={() => page.setPaymentCalendarMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))}>→</Button>
                                <Button
                                    type="button"
                                    className="filter-button"
                                    style={{ padding: '0.35rem 0.55rem' }}
                                    title="Текущий месяц"
                                    onClick={() => {
                                        const n = new Date();
                                        page.setPaymentCalendarMonth({ year: n.getFullYear(), month: n.getMonth() + 1 });
                                    }}
                                >
                                    Сегодня
                                </Button>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem', marginLeft: '0.25rem' }} onClick={() => mutateCalendarInvoices()} title="Обновить счета с начала текущего года" aria-label="Обновить счета">
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </Flex>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0.5rem' }}>
                                <div className="payment-calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(2.5rem, 1fr))', gap: '2px', fontSize: '0.75rem', minWidth: '22rem' }}>
                                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'За неделю'].map((wd) => (
                                        <div key={wd} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600, padding: '0.25rem' }}>{wd}</div>
                                    ))}
                                    {(() => {
                                        const { year, month } = page.paymentCalendarMonth;
                                        const first = new Date(year, month - 1, 1);
                                        const lastDay = new Date(year, month, 0).getDate();
                                        const startOffset = (first.getDay() + 6) % 7;
                                        const cells: { day: number | null; key: string | null; dow: number }[] = [];
                                        for (let i = 0; i < startOffset; i++) cells.push({ day: null, key: null, dow: i });
                                        for (let d = 1; d <= lastDay; d++) {
                                            const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                            const date = new Date(year, month - 1, d);
                                            const dow = (date.getDay() + 6) % 7;
                                            cells.push({ day: d, key, dow });
                                        }
                                        const weeks: { cells: typeof cells }[] = [];
                                        for (let i = 0; i < cells.length; i += 7) {
                                            const chunk = cells.slice(i, i + 7);
                                            while (chunk.length < 7) chunk.push({ day: null, key: null, dow: chunk.length });
                                            weeks.push({ cells: chunk });
                                        }
                                        return weeks.flatMap(({ cells: weekCells }, wi) => {
                                            let weekSum = 0;
                                            for (let i = 0; i < 7; i++) {
                                                const c = weekCells[i];
                                                if (c?.key) {
                                                    const e = plannedByDate.get(c.key);
                                                    if (e?.total) weekSum += e.total;
                                                }
                                            }
                                            const monFri = weekCells.slice(0, 5);
                                            const row: React.ReactNode[] = monFri.map((c, i) => {
                                                const entry = c.key ? plannedByDate.get(c.key) : undefined;
                                                const sum = entry?.total;
                                                const hasSum = sum != null && sum > 0;
                                                return (
                                                    <div
                                                        key={`w${wi}-${i}-${c.key ?? ''}`}
                                                        className="payment-calendar-day-cell"
                                                        role={hasSum ? 'button' : undefined}
                                                        tabIndex={hasSum ? 0 : undefined}
                                                        onClick={hasSum && c.key ? () => page.setPaymentCalendarSelectedDate(c.key) : undefined}
                                                        onKeyDown={hasSum && c.key ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); page.setPaymentCalendarSelectedDate(c.key); } } : undefined}
                                                        style={{
                                                            padding: '0.35rem',
                                                            textAlign: 'center',
                                                            borderRadius: 4,
                                                            background: hasSum ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                                            color: hasSum ? 'white' : 'var(--color-text-secondary)',
                                                            minHeight: '2.25rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: hasSum ? 'pointer' : undefined,
                                                        }}
                                                        title={c.key && hasSum ? `${c.key}: ${Math.round(sum!).toLocaleString('ru-RU')} ₽` : undefined}
                                                    >
                                                        {c.day != null ? c.day : ''}
                                                        {hasSum && <span className="payment-calendar-day-amount" style={{ fontSize: '0.65rem', lineHeight: 1 }}>{formatCurrency(sum!, true)}</span>}
                                                    </div>
                                                );
                                            });
                                            row.push(
                                                <div
                                                    key={`week-${wi}`}
                                                    className="payment-calendar-week-total"
                                                    style={{
                                                        padding: '0.35rem',
                                                        textAlign: 'center',
                                                        borderRadius: 4,
                                                        background: weekSum > 0 ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                                        color: weekSum > 0 ? 'white' : 'var(--color-text-secondary)',
                                                        minHeight: '2.25rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: weekSum > 0 ? 600 : undefined,
                                                    }}
                                                >
                                                    {weekSum > 0 ? formatCurrency(weekSum, true) : '—'}
                                                </div>
                                            );
                                            return row;
                                        });
                                    })()}
                                </div>
                            </div>
                            {page.paymentCalendarSelectedDate && plannedByDate.get(page.paymentCalendarSelectedDate) && (
                                <div className="modal-overlay" style={{ zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="payment-calendar-day-title" onClick={() => page.setPaymentCalendarSelectedDate(null)}>
                                    <div className="modal-content" style={{ maxWidth: '22rem', padding: '1rem', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                                        <Typography.Body id="payment-calendar-day-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                                            Плановое поступление — {page.paymentCalendarSelectedDate}
                                        </Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                                            Заказчики и суммы:
                                        </Typography.Body>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            {plannedByDate.get(page.paymentCalendarSelectedDate)!.items.map((row, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--color-border)' }}>
                                                    <Typography.Body style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.customer}>{row.customer}</Typography.Body>
                                                    <Typography.Body style={{ fontWeight: 600, flexShrink: 0 }}>{formatCurrency(row.sum, true)}</Typography.Body>
                                                </div>
                                            ))}
                                        </div>
                                        <Flex justify="space-between" align="center" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)', fontWeight: 600 }}>
                                            <Typography.Body>Итого:</Typography.Body>
                                            <Typography.Body>{formatCurrency(plannedByDate.get(page.paymentCalendarSelectedDate)!.total, true)}</Typography.Body>
                                        </Flex>
                                        <Button type="button" className="filter-button" style={{ marginTop: '0.75rem', width: '100%' }} onClick={() => page.setPaymentCalendarSelectedDate(null)}>Закрыть</Button>
                                    </div>
                                </div>
                            )}
                            {plannedByDate.size === 0 && !page.paymentCalendarLoading && (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                                    Нет данных за выбранный период или условия оплаты не заданы в справочнике.
                                </Typography.Body>
                            )}
                        </>
                    )}
                </Panel>
            )}

            {/* 4. Старение дебиторки */}
            {page.useServiceRequest && !page.loading && !page.error && invoiceAging.total > 0 && page.showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Старение дебиторки
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                        Неоплаченные счета по давности выставления
                    </Typography.Body>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        {invoiceAging.buckets.map((b) => (
                            <div
                                key={b.label}
                                onClick={() => b.count > 0 && page.setExpandedAgingBucket(page.expandedAgingBucket === b.label ? null : b.label)}
                                style={{
                                    border: `1px solid ${page.expandedAgingBucket === b.label ? b.color : b.color + '33'}`,
                                    borderRadius: 10,
                                    padding: '0.55rem',
                                    background: page.expandedAgingBucket === b.label ? `${b.color}18` : `${b.color}0a`,
                                    cursor: b.count > 0 ? 'pointer' : 'default',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem', display: 'block' }}>{b.label}</Typography.Body>
                                <Typography.Body style={{ fontWeight: 700, fontSize: '1rem', color: b.color, display: 'block', marginBottom: '0.15rem' }}>{b.count}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600, display: 'block' }}>{formatCurrency(b.sum, true)}</Typography.Body>
                            </div>
                        ))}
                    </div>
                    <div style={{ height: 10, borderRadius: 5, background: 'var(--color-bg-hover)', overflow: 'hidden', display: 'flex' }}>
                        {invoiceAging.buckets.map((b, bi) => (
                            <DashboardChartBarH
                                key={`aging-bar-${b.label}`}
                                enabled={page.chartBarFillEnabled}
                                widthPercent={invoiceAging.total > 0 ? (b.sum / invoiceAging.total) * 100 : 0}
                                delay={bi * 0.06}
                                style={{ background: b.color }}
                                title={`${b.label}: ${formatCurrency(b.sum, true)}`}
                            />
                        ))}
                    </div>
                    {page.expandedAgingBucket && (() => {
                        const bucket = invoiceAging.buckets.find((b) => b.label === page.expandedAgingBucket);
                        if (!bucket || bucket.items.length === 0) return null;
                        const sorted = [...bucket.items].sort((a, b2) => {
                            let cmp = 0;
                            if (page.agingSortCol === 'number') cmp = a.number.localeCompare(b2.number);
                            else if (page.agingSortCol === 'customer') cmp = a.customer.localeCompare(b2.customer);
                            else if (page.agingSortCol === 'status') cmp = a.status.localeCompare(b2.status);
                            else if (page.agingSortCol === 'shipmentStatus') cmp = a.shipmentStatus.localeCompare(b2.shipmentStatus);
                            else if (page.agingSortCol === 'sum') cmp = a.sum - b2.sum;
                            else cmp = a.days - b2.days;
                            return page.agingSortAsc ? cmp : -cmp;
                        });
                        const toggleSort = (col: typeof page.agingSortCol) => {
                            if (page.agingSortCol === col) page.setAgingSortAsc(!page.agingSortAsc);
                            else { page.setAgingSortCol(col); page.setAgingSortAsc(col === 'number' || col === 'customer' || col === 'status' || col === 'shipmentStatus'); }
                        };
                        const arrow = (col: typeof page.agingSortCol) => page.agingSortCol === col ? (page.agingSortAsc ? ' ↑' : ' ↓') : '';
                        const thStyle = (align: string): React.CSSProperties => ({ padding: '0.35rem 0.5rem', textAlign: align as any, fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' });
                        const shipmentColor = (s: string) => {
                            if (!s || s === '—') return '#94a3b8';
                            const l = s.toLowerCase();
                            if (l.includes('доставлен') || l.includes('заверш')) return '#10b981';
                            if (l.includes('доставке')) return '#f59e0b';
                            if (l.includes('готов')) return '#8b5cf6';
                            if (l.includes('пути') || l.includes('отправлен')) return '#3b82f6';
                            return '#94a3b8';
                        };
                        return (
                            <div style={{ marginTop: '0.6rem' }}>
                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: bucket.color }}>
                                    {bucket.label} — {bucket.count} {bucket.count === 1 ? 'счёт' : bucket.count < 5 ? 'счёта' : 'счетов'}
                                </Typography.Body>
                                <div style={{ maxHeight: 280, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--color-bg-hover)', position: 'sticky', top: 0 }}>
                                                <th style={thStyle('left')} onClick={() => toggleSort('number')}>Счёт{arrow('number')}</th>
                                                <th className="customer-col" style={thStyle('left')} onClick={() => toggleSort('customer')}>Заказчик{arrow('customer')}</th>
                                                <th style={thStyle('center')} onClick={() => toggleSort('status')}>Статус{arrow('status')}</th>
                                                <th style={thStyle('center')} onClick={() => toggleSort('shipmentStatus')}>Статус перевозки{arrow('shipmentStatus')}</th>
                                                <th style={{ ...thStyle('center'), cursor: 'default' }}>Маршрут</th>
                                                <th style={thStyle('right')} onClick={() => toggleSort('sum')}>Сумма{arrow('sum')}</th>
                                                <th style={thStyle('right')} onClick={() => toggleSort('days')}>Дней{arrow('days')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sorted.map((inv, idx) => {
                                                const st = inv.status || '—';
                                                const stColor = /оплач/i.test(st) ? '#10b981' : /частич/i.test(st) ? '#f59e0b' : /просроч/i.test(st) ? '#ef4444' : /выставлен|ожида/i.test(st) ? '#3b82f6' : '#94a3b8';
                                                const shipSt = inv.shipmentStatus || '—';
                                                const shipStColor = shipmentColor(shipSt);
                                                const route = inv.route || '—';
                                                return (
                                                <tr key={`aging-inv-${idx}`} style={{ borderTop: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '0.3rem 0.5rem', whiteSpace: 'nowrap' }}>{inv.number}</td>
                                                    <td style={{ padding: '0.3rem 0.5rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.customer}</td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.4rem', borderRadius: 999, background: `${stColor}18`, color: stColor, border: `1px solid ${stColor}44`, fontWeight: 600, whiteSpace: 'nowrap' }}>{st}</span>
                                                    </td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.4rem', borderRadius: 999, background: `${shipStColor}18`, color: shipStColor, border: `1px solid ${shipStColor}44`, fontWeight: 600, whiteSpace: 'nowrap' }}>{shipSt}</span>
                                                    </td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                                                        <RouteBadge route={route} />
                                                    </td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(inv.sum, true)}</td>
                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: bucket.color, fontWeight: 600 }}>{inv.days}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}
                </Panel>
            )}

            {/* 3. Pareto / ABC-анализ клиентов */}
            {page.useServiceRequest && !page.loading && !page.error && paretoByCustomer.rows.length > 0 && page.showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        ABC-анализ клиентов
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                        Концентрация выручки по заказчикам (Парето)
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem', lineHeight: '1.4' }}>
                        % после суммы — кумулятивная доля: сколько от общей выручки дают все клиенты от первого до текущего. A (≤80%) — ключевые, B (≤95%) — средние, C — остальные.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 280, overflowY: 'auto' }}>
                        {paretoByCustomer.rows.slice(0, 15).map((row, i) => {
                            const zone = row.cumPercent <= 80 ? 'A' : row.cumPercent <= 95 ? 'B' : 'C';
                            const zoneColor = zone === 'A' ? '#10b981' : zone === 'B' ? '#f59e0b' : '#94a3b8';
                            return (
                                <div key={`pareto-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: zoneColor, width: 16, textAlign: 'center', flexShrink: 0 }}>{zone}</span>
                                    <Typography.Body style={{ fontSize: '0.76rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>{row.name}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600, flexShrink: 0 }}>{formatCurrency(row.value, true)}</Typography.Body>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', flexShrink: 0, minWidth: 40, textAlign: 'right' }}>∑{row.cumPercent}%</Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '0.45rem' }}>
                        Всего клиентов: {paretoByCustomer.rows.length} · A (80%): {paretoByCustomer.rows.filter((r) => r.cumPercent <= 80).length} · B (95%): {paretoByCustomer.rows.filter((r) => r.cumPercent > 80 && r.cumPercent <= 95).length} · C: {paretoByCustomer.rows.filter((r) => r.cumPercent > 95).length}
                    </Typography.Body>
                </Panel>
            )}

            {/* 9. Доля повторных клиентов */}
            {page.useServiceRequest && !page.loading && !page.error && repeatCustomers && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Повторные клиенты
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem' }}>
                        Текущий период vs предыдущий — доля возвращающихся заказчиков
                    </Typography.Body>
                    <Flex gap="1rem" wrap="wrap" style={{ marginBottom: '0.5rem' }}>
                        <div style={{ textAlign: 'center' }}>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.5rem', color: '#10b981' }}>{repeatCustomers.repeatPercent}%</Typography.Body>
                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>повторных</Typography.Body>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => page.setRepeatCustomersListMode((m) => (m === 'all' ? null : 'all'))}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
                                title="Показать список всех заказчиков"
                            >
                                <Typography.Body style={{ fontWeight: 700, fontSize: '1.5rem', textDecoration: page.repeatCustomersListMode === 'all' ? 'underline' : 'none' }}>{repeatCustomers.total}</Typography.Body>
                            </button>
                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>всего клиентов</Typography.Body>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => page.setRepeatCustomersListMode((m) => (m === 'repeat' ? null : 'repeat'))}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
                                title="Показать список повторных заказчиков"
                            >
                                <Typography.Body style={{ fontWeight: 700, fontSize: '1.5rem', color: '#3b82f6', textDecoration: page.repeatCustomersListMode === 'repeat' ? 'underline' : 'none' }}>{repeatCustomers.repeat}</Typography.Body>
                            </button>
                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>повторных</Typography.Body>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => page.setRepeatCustomersListMode((m) => (m === 'new' ? null : 'new'))}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
                                title="Показать список новых заказчиков"
                            >
                                <Typography.Body style={{ fontWeight: 700, fontSize: '1.5rem', color: '#f59e0b', textDecoration: page.repeatCustomersListMode === 'new' ? 'underline' : 'none' }}>{repeatCustomers.new}</Typography.Body>
                            </button>
                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>новых</Typography.Body>
                        </div>
                    </Flex>
                    <div style={{ height: 12, borderRadius: 6, background: 'var(--color-bg-hover)', overflow: 'hidden', display: 'flex' }}>
                        <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={repeatCustomers.repeatPercent} delay={0.05} style={{ background: '#10b981', borderRadius: '6px 0 0 6px' }} />
                        <DashboardChartBarH enabled={page.chartBarFillEnabled} widthPercent={100 - repeatCustomers.repeatPercent} delay={0.12} style={{ background: '#f59e0b', borderRadius: '0 6px 6px 0' }} />
                    </div>
                    <Flex gap="0.75rem" style={{ marginTop: '0.3rem' }}>
                        <Flex align="center" gap="0.25rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /><Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>Повторные</Typography.Body></Flex>
                        <Flex align="center" gap="0.25rem"><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /><Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>Новые</Typography.Body></Flex>
                    </Flex>
                    {page.repeatCustomersListMode && (
                        <div style={{ marginTop: '0.6rem', padding: '0.55rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                            <Typography.Body style={{ fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                                {page.repeatCustomersListMode === 'all'
                                    ? `Все заказчики (${repeatCustomers.allList.length})`
                                    : page.repeatCustomersListMode === 'repeat'
                                        ? `Повторные заказчики (${repeatCustomers.repeatList.length})`
                                        : `Новые заказчики (${repeatCustomers.newList.length})`}
                            </Typography.Body>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {(page.repeatCustomersListMode === 'all'
                                    ? repeatCustomers.allList
                                    : page.repeatCustomersListMode === 'repeat'
                                        ? repeatCustomers.repeatList
                                        : repeatCustomers.newList
                                ).map((name) => (
                                    <span key={name} style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem', borderRadius: 999, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
                                        {stripOoo(name)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </Panel>
            )}

        </>
    );
}
