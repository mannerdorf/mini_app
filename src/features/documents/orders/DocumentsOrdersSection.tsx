import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { cityToCode, formatInvoiceNumber, stripOoo } from "../../../lib/formatUtils";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { AppBadge } from "../../../components/shared/AppBadge";
import { DocumentsRouteBadge, DocumentsStateBlocks } from "../views/documentsViewBlocks";
import { getParcelSearchText, getRequestParcels } from "../sendings/sendingsParcelHelpers";
import {
  cargoListContainerVariants,
  cargoModeSwitchMotion,
  documentsListItemVariants,
} from "../../../pages/cargoMotion";

type Props = {
  active: boolean;
  ordersLoading: boolean;
  ordersError: string | null;
  tableModeEffective: boolean;
  docsMotionEnabled: boolean;
  effectiveServiceMode: boolean;
  effectiveSearchText: string;
  orderRowsSorted: any[];
  ordersSortColumn: "date" | "number" | "clientNumber" | "pickupDate" | "cargo" | "sender" | "receiver" | "route" | "customer" | "comment";
  ordersSortOrder: "asc" | "desc";
  ordersParcelsSortColumn: "parcel" | "cargo" | "tmc" | "consolidation" | "count" | "cost";
  ordersParcelsSortOrder: "asc" | "desc";
  handleOrdersSort: (column: Props["ordersSortColumn"]) => void;
  handleOrdersParcelsSort: (column: Props["ordersParcelsSortColumn"]) => void;
  expandedOrderRow: string | null;
  setExpandedOrderRow: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenCargo?: (cargoNumber: string) => void;
};

export function DocumentsOrdersSection({
  active,
  ordersLoading,
  ordersError,
  tableModeEffective,
  docsMotionEnabled,
  effectiveServiceMode,
  effectiveSearchText,
  orderRowsSorted,
  ordersSortColumn,
  ordersSortOrder,
  ordersParcelsSortColumn,
  ordersParcelsSortOrder,
  handleOrdersSort,
  handleOrdersParcelsSort,
  expandedOrderRow,
  setExpandedOrderRow,
  onOpenCargo,
}: Props) {
  if (!active) return null;

  return (
    <>
      {(ordersLoading || !!ordersError) && <DocumentsStateBlocks loading={ordersLoading} error={ordersError} emptyText="" />}
      <AnimatePresence mode="wait">
{!ordersLoading && !ordersError && tableModeEffective && orderRowsSorted.length > 0 ? (
    <motion.div key="docs-orders-table" className="documents-table-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
    <div className="cargo-card documents-zayavki-below-new-order" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('date')} title="Сортировка">Дата {ordersSortColumn === 'date' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('pickupDate')} title="Сортировка">Дата забора план {ordersSortColumn === 'pickupDate' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('number')} title="Сортировка">Номер заявки {ordersSortColumn === 'number' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('clientNumber')} title="Сортировка">Номер заявки заказчика {ordersSortColumn === 'clientNumber' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                    {effectiveServiceMode && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('customer')} title="Сортировка">Заказчик {ordersSortColumn === 'customer' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('sender')} title="Сортировка">Отправитель {ordersSortColumn === 'sender' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('receiver')} title="Сортировка">Получатель {ordersSortColumn === 'receiver' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('route')} title="Сортировка">Маршрут {ordersSortColumn === 'route' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                    {effectiveServiceMode && <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleOrdersSort('comment')} title="Сортировка">Комментарий {ordersSortColumn === 'comment' && (ordersSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>}
                </tr>
            </thead>
            <tbody>
                {orderRowsSorted.map((row: any, idx: number) => {
                    const rawDate = row?.Дата ?? row?.DateZayavki ?? row?.Date ?? row?.date ?? '';
                    const requestNumber = String(row?.НомерЗаявки ?? row?.Номер ?? row?.Number ?? row?.number ?? row?.N ?? '');
                    const parcels = getRequestParcels(row);
                    const searchLower = effectiveSearchText.trim().toLowerCase();
                    const parcelMatches = searchLower ? parcels.filter((parcel: any) => getParcelSearchText(parcel).includes(searchLower)) : [];
                    const hasParcelSearchMatches = !!searchLower && parcelMatches.length > 0;
                    const parcelsToRender = hasParcelSearchMatches ? parcelMatches : parcels;
                    const sortedParcelsToRender = [...parcelsToRender].sort((a: any, b: any) => {
                        const goodsA = Array.isArray(a?.Товары) ? (a.Товары[0] ?? {}) : (a?.Товары && typeof a.Товары === 'object' ? a.Товары : a);
                        const goodsB = Array.isArray(b?.Товары) ? (b.Товары[0] ?? {}) : (b?.Товары && typeof b.Товары === 'object' ? b.Товары : b);
                        const toNumber = (v: unknown) => {
                            const n = Number(String(v ?? '').replace(',', '.'));
                            return Number.isFinite(n) ? n : 0;
                        };
                        let cmp = 0;
                        switch (ordersParcelsSortColumn) {
                            case 'parcel':
                                cmp = String(a?.ПосылкаНаименование ?? a?.Посылка ?? a?.ИДОтправления ?? '').localeCompare(String(b?.ПосылкаНаименование ?? b?.Посылка ?? b?.ИДОтправления ?? ''), undefined, { numeric: true });
                                break;
                            case 'cargo':
                                cmp = String(a?.Перевозка ?? '').localeCompare(String(b?.Перевозка ?? ''), undefined, { numeric: true });
                                break;
                            case 'tmc':
                                cmp = String(goodsA?.ТМЦ ?? '').localeCompare(String(goodsB?.ТМЦ ?? ''));
                                break;
                            case 'consolidation':
                                cmp = String(goodsA?.ИДОтправления ?? '').localeCompare(String(goodsB?.ИДОтправления ?? ''), undefined, { numeric: true });
                                break;
                            case 'count':
                                cmp = toNumber(goodsA?.Количество) - toNumber(goodsB?.Количество);
                                break;
                            case 'cost':
                                cmp = toNumber(goodsA?.ОбъявленнаяСтоимостьТовараДляПечати ?? goodsA?.ОбъявленнаяСтоимостьТовара) - toNumber(goodsB?.ОбъявленнаяСтоимостьТовараДляПечати ?? goodsB?.ОбъявленнаяСтоимостьТовара);
                                break;
                        }
                        return ordersParcelsSortOrder === 'asc' ? cmp : -cmp;
                    });
                    const cargoNumber = String(
                        row?.НомерПеревозки ??
                        row?.Перевозка ??
                        row?.CargoNumber ??
                        row?.NumberPerevozki ??
                        parcels?.[0]?.Перевозка ??
                        ''
                    );
                    const customer = String(row?.ЗаказчикНаименование ?? row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? row?.ПлательщикНаименование ?? row?.PayerName ?? '');
                    const receiver = String(row?.ПолучательНаименование ?? row?.Получатель ?? row?.ГрузополучательНаименование ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '');
                    const sender = String(row?.ОтправительНаименование ?? row?.Отправитель ?? row?.ГрузоотправительНаименование ?? row?.Грузоотправитель ?? row?.Sender ?? row?.sender ?? row?.Shipper ?? row?.Consignor ?? '');
                    const comment = String(row?.Комментарий ?? row?.Comment ?? row?.Примечание ?? row?.Note ?? '');
                    const customerRequestNumber = String(row?.НомерЗаявкиКлиента ?? row?.ClientRequestNumber ?? '');
                    const pickupDate = String(row?.ДатаЗабораПлан ?? row?.PickupDatePlan ?? '');
                    const rowKey = `${requestNumber || 'row'}-${cargoNumber || idx}`;
                    const expanded = expandedOrderRow === rowKey;
                    const senderPoint = String(row?.ПунктОтправкиНаименование ?? row?.ПунктОтправки ?? row?.ПунктОтправления ?? row?.АдресОтправки ?? row?.SenderPoint ?? '');
                    const destinationPoint = String(row?.ПунктНазначенияНаименование ?? row?.ПунктНазначения ?? row?.ПунктДоставки ?? row?.ReceiverPoint ?? row?.DestinationPoint ?? '');
                    const route = [cityToCode(senderPoint) || senderPoint, cityToCode(destinationPoint) || destinationPoint].filter(Boolean).join(' – ') || '—';
                    return (
                        <React.Fragment key={rowKey}>
                            <tr
                                style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expanded ? 'var(--color-bg-hover)' : undefined }}
                                onClick={() => setExpandedOrderRow((prev) => (prev === rowKey ? null : rowKey))}
                                title={expanded ? 'Свернуть' : 'Показать детали заявки'}
                            >
                                <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={rawDate ? String(rawDate) : undefined} /></td>
                                <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={pickupDate || undefined} /></td>
                                <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{requestNumber ? formatInvoiceNumber(requestNumber) : '—'}</td>
                                <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{customerRequestNumber || '—'}</td>
                                {effectiveServiceMode && (
                                    <td
                                        style={{
                                            padding: '0.5rem 0.4rem',
                                            maxWidth: 220,
                                            verticalAlign: 'top',
                                        }}
                                        title={stripOoo(customer) || '—'}
                                    >
                                        <div
                                            style={{
                                                overflow: 'hidden',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                            }}
                                        >
                                            {stripOoo(customer) || '—'}
                                        </div>
                                    </td>
                                )}
                                <td
                                    style={{
                                        padding: '0.5rem 0.4rem',
                                        maxWidth: 220,
                                        verticalAlign: 'top',
                                    }}
                                    title={stripOoo(sender) || '—'}
                                >
                                    <div
                                        style={{
                                            overflow: 'hidden',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                        }}
                                    >
                                        {stripOoo(sender) || '—'}
                                    </div>
                                </td>
                                <td
                                    style={{
                                        padding: '0.5rem 0.4rem',
                                        maxWidth: 220,
                                        verticalAlign: 'top',
                                    }}
                                    title={stripOoo(receiver) || '—'}
                                >
                                    <div
                                        style={{
                                            overflow: 'hidden',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                        }}
                                    >
                                        {stripOoo(receiver) || '—'}
                                    </div>
                                </td>
                                <td style={{ padding: '0.5rem 0.4rem' }}>
                                    <DocumentsRouteBadge>
                                        {route}
                                    </DocumentsRouteBadge>
                                </td>
                                {effectiveServiceMode && <td style={{ padding: '0.5rem 0.4rem' }}>{comment || '—'}</td>}
                            </tr>
                            {expanded && (
                                <tr>
                                    <td colSpan={effectiveServiceMode ? 9 : 7} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                        <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 220px) 1fr', gap: '0.35rem 0.75rem', fontSize: '0.85rem' }}>
                                                <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Заказчик:</Typography.Body>
                                                <Typography.Body>{customer || '—'}</Typography.Body>
                                                <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Пункт отправки:</Typography.Body>
                                                <Typography.Body>{senderPoint || '—'}</Typography.Body>
                                                <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Отправитель:</Typography.Body>
                                                <Typography.Body>{sender || '—'}</Typography.Body>
                                                <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Пункт назначения:</Typography.Body>
                                                <Typography.Body>{destinationPoint || '—'}</Typography.Body>
                                                <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Получатель:</Typography.Body>
                                                <Typography.Body>{receiver || '—'}</Typography.Body>
                                            </div>
                                        </div>
                                        <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                            {parcelsToRender.length === 0 ? (
                                                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.5rem 0.25rem' }}>Нет данных по посылкам</Typography.Body>
                                            ) : (
                                                <>
                                                <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('parcel'); }} title="Сортировка">Посылка {ordersParcelsSortColumn === 'parcel' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('cargo'); }} title="Сортировка">Консолидация {ordersParcelsSortColumn === 'cargo' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('tmc'); }} title="Сортировка">Номенклатура {ordersParcelsSortColumn === 'tmc' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('consolidation'); }} title="Сортировка">Консолидация {ordersParcelsSortColumn === 'consolidation' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('count'); }} title="Сортировка">Кол-во {ordersParcelsSortColumn === 'count' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                            <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleOrdersParcelsSort('cost'); }} title="Сортировка">Стоимость {ordersParcelsSortColumn === 'cost' && (ordersParcelsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sortedParcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                            const goodsRaw = parcel?.Товары;
                                                            const goods = Array.isArray(goodsRaw)
                                                                ? (goodsRaw[0] ?? {})
                                                                : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : parcel);
                                                            return (
                                                                <tr
                                                                    key={`${rowKey}-parcel-${parcel?.Посылка ?? parcelIdx}`}
                                                                    style={{
                                                                        borderBottom: '1px solid var(--color-border)',
                                                                        background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                    }}
                                                                >
                                                                    <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? parcel?.Посылка ?? parcel?.ИДОтправления ?? '—'}</td>
                                                                    <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}><ClickableCargoNumber number={parcel?.Перевозка} onOpen={onOpenCargo} /></td>
                                                                    <td style={{ padding: '0.35rem 0.3rem' }}>{goods?.ТМЦ ?? '—'}</td>
                                                                    <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{goods?.ИДОтправления ?? '—'}</td>
                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.ОбъявленнаяСтоимостьТовараДляПечати ?? goods?.ОбъявленнаяСтоимостьТовара ?? '—'}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                                </>
                                            )}
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
    </motion.div>
) : !ordersLoading && !ordersError && !tableModeEffective && orderRowsSorted.length > 0 ? (
    <motion.div key="docs-orders-cards" className="documents-cards-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
    <motion.div
        className="cargo-list documents-zayavki-below-new-order"
        variants={docsMotionEnabled ? cargoListContainerVariants : undefined}
        initial={docsMotionEnabled ? "hidden" : false}
        animate={docsMotionEnabled ? "visible" : undefined}
    >
        {orderRowsSorted.map((row: any, idx: number) => {
            const rawDate = row?.Дата ?? row?.DateZayavki ?? row?.Date ?? row?.date ?? '';
            const requestNumber = String(row?.НомерЗаявки ?? row?.Номер ?? row?.Number ?? row?.number ?? row?.N ?? '');
            const customerRequestNumber = String(row?.НомерЗаявкиКлиента ?? row?.ClientRequestNumber ?? '');
            const pickupDate = String(row?.ДатаЗабораПлан ?? row?.PickupDatePlan ?? '');
            const parcels = getRequestParcels(row);
            const searchLower = effectiveSearchText.trim().toLowerCase();
            const parcelMatches = searchLower ? parcels.filter((parcel: any) => getParcelSearchText(parcel).includes(searchLower)) : [];
            const hasParcelSearchMatches = !!searchLower && parcelMatches.length > 0;
            const parcelsToRender = hasParcelSearchMatches ? parcelMatches : parcels;
            const cargoNumber = String(
                row?.НомерПеревозки ??
                row?.Перевозка ??
                row?.CargoNumber ??
                row?.NumberPerevozki ??
                parcels?.[0]?.Перевозка ??
                ''
            );
            const customer = String(row?.ЗаказчикНаименование ?? row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? row?.ПлательщикНаименование ?? row?.PayerName ?? '');
            const receiver = String(row?.ПолучательНаименование ?? row?.Получатель ?? row?.ГрузополучательНаименование ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '');
            const sender = String(row?.ОтправительНаименование ?? row?.Отправитель ?? row?.ГрузоотправительНаименование ?? row?.Грузоотправитель ?? row?.Sender ?? row?.sender ?? row?.Shipper ?? row?.Consignor ?? '');
            const comment = String(row?.Комментарий ?? row?.Comment ?? row?.Примечание ?? row?.Note ?? '');
            const senderPoint = String(row?.ПунктОтправкиНаименование ?? row?.ПунктОтправки ?? row?.ПунктОтправления ?? row?.АдресОтправки ?? row?.SenderPoint ?? '');
            const destinationPoint = String(row?.ПунктНазначенияНаименование ?? row?.ПунктНазначения ?? row?.ПунктДоставки ?? row?.ReceiverPoint ?? row?.DestinationPoint ?? '');
            const route = [cityToCode(senderPoint) || senderPoint, cityToCode(destinationPoint) || destinationPoint].filter(Boolean).join(' – ') || '—';
            const rowKey = `${requestNumber || 'row'}-${cargoNumber || idx}`;
            const expanded = expandedOrderRow === rowKey;
            return (
                <motion.div
                    key={rowKey}
                    variants={docsMotionEnabled ? documentsListItemVariants : undefined}
                    initial={docsMotionEnabled ? "hidden" : false}
                    animate={docsMotionEnabled ? "visible" : undefined}
                >
                <Panel
                    className="cargo-card"
                    onClick={() => setExpandedOrderRow((prev) => (prev === rowKey ? null : rowKey))}
                    style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative' }}
                    title={expanded ? 'Свернуть детали заявки' : 'Показать детали заявки'}
                >
                    <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem', minWidth: 0, overflow: 'visible' }}>
                        <Flex align="center" gap="0.5rem" style={{ flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0, maxWidth: '65%' }}>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
                                {requestNumber ? formatInvoiceNumber(requestNumber) : '—'}
                            </Typography.Body>
                            {customerRequestNumber && (
                                <AppBadge tone="purple">
                                    № клиента {customerRequestNumber}
                                </AppBadge>
                            )}
                        </Flex>
                        <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem', flexShrink: 0 }}>
                            <DateText value={rawDate ? String(rawDate) : undefined} />
                        </Typography.Label>
                    </Flex>
                    <Flex justify="space-between" align="center" style={{ marginBottom: '0.45rem' }}>
                        <DocumentsRouteBadge>
                            {route}
                        </DocumentsRouteBadge>
                        <Typography.Label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            Забор: <DateText value={pickupDate || undefined} />
                        </Typography.Label>
                    </Flex>
                    <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        <Typography.Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '48%' }} title={stripOoo(String(sender || ''))}>
                            {stripOoo(String(sender || '—'))}
                        </Typography.Label>
                        <Typography.Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '48%', textAlign: 'right' }} title={stripOoo(String(receiver || ''))}>
                            {stripOoo(String(receiver || '—'))}
                        </Typography.Label>
                    </Flex>
                    {effectiveServiceMode && (
                        <Typography.Label style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo(customer) || '—'}>
                            Заказчик: {stripOoo(customer) || '—'}
                        </Typography.Label>
                    )}
                    {expanded && (
                        <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.55rem' }} onClick={(ev) => ev.stopPropagation()}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 180px) 1fr', gap: '0.3rem 0.7rem', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
                                <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Пункт отправки:</Typography.Body>
                                <Typography.Body>{senderPoint || '—'}</Typography.Body>
                                <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Пункт назначения:</Typography.Body>
                                <Typography.Body>{destinationPoint || '—'}</Typography.Body>
                                {effectiveServiceMode && (
                                    <>
                                        <Typography.Body style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Комментарий:</Typography.Body>
                                        <Typography.Body>{comment || '—'}</Typography.Body>
                                    </>
                                )}
                            </div>
                            {parcelsToRender.length === 0 ? (
                                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.35rem 0.2rem', fontSize: '0.8rem' }}>
                                    Нет данных по посылкам
                                </Typography.Body>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Посылка</th>
                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Консолидация</th>
                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Номенклатура</th>
                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Кол-во</th>
                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Стоимость</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                const goodsRaw = parcel?.Товары;
                                                const goods = Array.isArray(goodsRaw)
                                                    ? (goodsRaw[0] ?? {})
                                                    : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : parcel);
                                                return (
                                                    <tr key={`${rowKey}-card-parcel-${parcel?.Посылка ?? parcelIdx}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? parcel?.Посылка ?? parcel?.ИДОтправления ?? '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}><ClickableCargoNumber number={parcel?.Перевозка} onOpen={onOpenCargo} /></td>
                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{goods?.ТМЦ ?? '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.ОбъявленнаяСтоимостьТовараДляПечати ?? goods?.ОбъявленнаяСтоимостьТовара ?? '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </Panel>
                </motion.div>
            );
        })}
    </motion.div>
    </motion.div>
) : null}
</AnimatePresence>
      {!ordersLoading && !ordersError && orderRowsSorted.length === 0 && (
        <Typography.Body className="text-empty-state" style={{ padding: "2rem 0" }}>
          Нет заявок за выбранный период
        </Typography.Body>
      )}
    </>
  );
}
