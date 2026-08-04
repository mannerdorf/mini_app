import React from "react";
import { motion } from "motion/react";

import { ArrowDown, ArrowUp } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { CargoTransportTypeIcon } from "../../../components/shared/CargoTableDisplay";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { formatCurrency, formatInvoiceNumber, cityToCode } from "../../../lib/formatUtils";
import { STATUS_MAP } from "../../../lib/statusUtils";
import {
  formatSendingMetricNum,
  getSendingRowParcelMetrics,
} from "./sendingsMetrics";
import {
  getRequestParcels,
  getParcelSearchText,
} from "./sendingsParcelHelpers";
import { getSendingRowTransportMode } from "./sendingsTransportHelpers";
import {
  getSendingRowKey,
  getSendingsAnalyticsExtraColCount,
} from "./sendingsRowHelpers";
import { DocumentsRouteBadge } from "../views/documentsViewBlocks";
import { SendingsTableExpandedRow } from "./SendingsTableExpandedRow";
import type { SendingsSectionViewProps } from "./sendingsSectionProps";

export function SendingsTableView(props: SendingsSectionViewProps) {
  const {
    tableModeEffective,
    docsMotionEnabled,
    cargoModeSwitchMotion,
    canSelectSendingRows,
    allVisibleSendingsSelected,
    visibleSendingMeta,
    setSelectedSendingRowKeys,
    selectedSendingRowKeys,
    handleSendingsSort,
    sendingsSortColumn,
    sendingsSortOrder,
    hasAnalytics,
    showSums,
    showEorColumn,
    canEditEor,
    canEditPlanDate,
    canRunSanctionsCheck,
    sendingRowsSorted,
    sendingsRowRuntime,
    normalizeTransportDisplay,
    effectiveSearchText,
    expandedSendingRow,
    setExpandedSendingRow,
    cargoSumByNumber,
    eorStatusMap,
    ferriesList,
    sendingsFerryMap,
    ferryEtaLoadingByRow,
    handleFerrySelect,
    effectiveActiveInn,
    getSendingsFerryEntry,
    onOpenAisWithMmsi,
    onOpenCargo,
    perevozkiItems,
    sendingsDetailsView,
    setSendingsDetailsView,
    sendingsSummaryGroupBy,
    setSendingsSummaryGroupBy,
    sendingsSummarySortColumn,
    sendingsSummarySortOrder,
    handleSendingsSummarySort,
    cargoStateByNumber,
    cargoPlanDateByNumber,
    cargoReceiverByNumber,
    cargoCustomerByNumber,
    showCustomerColumn,
    effectiveServiceMode,
    selectedByCustomerSummaryKeys,
    setSelectedByCustomerSummaryKeys,
    expandedByCustomerKey,
    setExpandedByCustomerKey,
    byCustomerPlanDateOpen,
    setByCustomerPlanDateOpen,
    byCustomerPlanDateValue,
    setByCustomerPlanDateValue,
    byCustomerActionLoading,
    setByCustomerActionLoading,
    byCustomerActionError,
    setByCustomerActionError,
    byCustomerActionInfo,
    setByCustomerActionInfo,
    selectedVisibleSendingCount,
    bulkSendingActionLoading,
    bulkEorMenuOpen,
    setBulkEorMenuOpen,
    bulkPlanDateOpen,
    setBulkPlanDateOpen,
    bulkPlanDateValue,
    setBulkPlanDateValue,
    bulkSendingActionError,
    bulkSendingActionInfo,
    applyBulkEorStatus,
    applyBulkPlanDate,
    applyBulkSanctionsCheck,
    applyByCustomerPlanDate,
    auth,
    handleOpenCargo,
  } = props;
  const sendingsAnalyticsExtraColCount = getSendingsAnalyticsExtraColCount(hasAnalytics, showSums);
  return (
                <motion.div key="docs-send-table" className="documents-table-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
                <div className="cargo-card" style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                {canSelectSendingRows && (
                                    <th style={{ padding: '0.5rem 0.35rem', textAlign: 'center', width: 34 }}>
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSendingsSelected}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setSelectedSendingRowKeys(() => (checked ? new Set(visibleSendingMeta.map((row) => row.rowKey)) : new Set()));
                                            }}
                                            aria-label="Выбрать все отправки"
                                        />
                                    </th>
                                )}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('date')} title="Сортировка">Дата {sendingsSortColumn === 'date' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('number')} title="Сортировка">Номер {sendingsSortColumn === 'number' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('route')} title="Сортировка">Маршрут {sendingsSortColumn === 'route' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'center', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('type')} title="Сортировка">Тип {sendingsSortColumn === 'type' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('transitHours')} title="Сортировка">В пути, ч {sendingsSortColumn === 'transitHours' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Статус доставки</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, lineHeight: 1.15 }}>Плановая дата прибытия<br />на терминал</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('vehicle')} title="Сортировка">Транспортное средство {sendingsSortColumn === 'vehicle' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                {hasAnalytics && (
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('paidWeight')} title="Сортировка">Плат. вес {sendingsSortColumn === 'paidWeight' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                )}
                                {hasAnalytics && showSums && (
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('cost')} title="Сумма за перевозку">Стоимость {sendingsSortColumn === 'cost' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                )}
                                {hasAnalytics && showSums && (
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600, lineHeight: 1.15, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('declaredCost')} title="Объявленная стоимость товара">Объявл.<br />стоимость {sendingsSortColumn === 'declaredCost' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                )}
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSort('comment')} title="Сортировка">Комментарий {sendingsSortColumn === 'comment' && (sendingsSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sendingRowsSorted.map((row: any, idx: number) => {
                                const rawDate = row?.Дата ?? row?.Date ?? row?.date ?? '';
                                const number = String(row?.Номер ?? row?.Number ?? row?.number ?? '');
                                const vehicle = normalizeTransportDisplay(row?.АвтомобильCMRНаименование ?? row?.AutoReg ?? row?.AutoType ?? '');
                                const comment = String(row?.Комментарий ?? row?.Comment ?? '');
                                const rowKey = getSendingRowKey(row, idx);
                                const parcels = getRequestParcels(row);
                                const searchLower = effectiveSearchText.trim().toLowerCase();
                                const parcelMatches = searchLower ? parcels.filter((parcel: any) => getParcelSearchText(parcel).includes(searchLower)) : [];
                                const hasParcelSearchMatches = !!searchLower && parcelMatches.length > 0;
                                const parcelsToRender = hasParcelSearchMatches ? parcelMatches : parcels;
                                const transportType = getSendingRowTransportMode(row, vehicle);
                                const sendingStatusKey = sendingsRowRuntime.getSendingStatusKey(row);
                                const sendingStatusLabel = sendingStatusKey === 'all' ? '' : STATUS_MAP[sendingStatusKey];
                                const transitHours = sendingsRowRuntime.getSendingTransitHours(row);
                                const transitDays = transitHours == null ? null : Math.round((transitHours / 24) * 10) / 10;
                                const isFinalTransit = sendingsRowRuntime.getSendingTransitIsFinal(row);
                                const plannedArrivalDate = sendingsRowRuntime.getSendingPlannedArrivalDate(row);
                                const routeFrom = String(row?.ПунктОтправленияГородАэропорт ?? row?.CitySender ?? row?.ГородОтправления ?? '').trim();
                                const routeTo = String(row?.ПунктНазначенияГородАэропорт ?? row?.CityReceiver ?? row?.ГородНазначения ?? '').trim();
                                const route = [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(' – ') || [routeFrom, routeTo].filter(Boolean).join(' – ') || '—';
                                const expanded = expandedSendingRow === rowKey;
                                const sendingParcelMetrics = getSendingRowParcelMetrics(row, cargoSumByNumber);
                                return (
                                    <React.Fragment key={rowKey}>
                                        <tr
                                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expanded ? 'var(--color-bg-hover)' : undefined }}
                                            onClick={() => setExpandedSendingRow((prev) => (prev === rowKey ? null : rowKey))}
                                            title={expanded ? 'Свернуть посылки' : 'Показать посылки'}
                                        >
                                            {canSelectSendingRows && (
                                                <td style={{ padding: '0.5rem 0.35rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSendingRowKeys.has(rowKey)}
                                                        onChange={(e) => {
                                                            const checked = e.target.checked;
                                                            setSelectedSendingRowKeys((prev) => {
                                                                const next = new Set(prev);
                                                                if (checked) next.add(rowKey);
                                                                else next.delete(rowKey);
                                                                return next;
                                                            });
                                                        }}
                                                        aria-label={`Выбрать отправку ${number || rowKey}`}
                                                    />
                                                </td>
                                            )}
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}><DateText value={rawDate ? String(rawDate) : undefined} /></td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>{number ? formatInvoiceNumber(number) : '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>
                                                <DocumentsRouteBadge>
                                                    {route}
                                                </DocumentsRouteBadge>
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', textAlign: 'center' }}>
                                                {transportType === 'ferry' || transportType === 'auto' ? (
                                                    <CargoTransportTypeIcon ak={transportType === 'ferry'} />
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                {transitHours == null ? '—' : (
                                                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
                                                        <span style={isFinalTransit ? { color: '#16a34a', fontWeight: 600 } : undefined}>
                                                            {Number.isInteger(transitHours) ? transitHours : transitHours.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ч
                                                        </span>
                                                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                                                            {(transitDays != null && Number.isInteger(transitDays) ? transitDays : (transitDays ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} д
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>
                                                {sendingStatusLabel ? <StatusBadge status={sendingStatusLabel} /> : '—'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>
                                                {plannedArrivalDate ? <DateText value={plannedArrivalDate.toISOString()} /> : 'нет'}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>{vehicle || '—'}</td>
                                            {hasAnalytics && (
                                                <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {formatSendingMetricNum(sendingParcelMetrics.paidWeight)}
                                                </td>
                                            )}
                                            {hasAnalytics && showSums && (
                                                <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {formatCurrency(sendingParcelMetrics.cost, true)}
                                                </td>
                                            )}
                                            {hasAnalytics && showSums && (
                                                <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {formatCurrency(sendingParcelMetrics.declaredCost, true)}
                                                </td>
                                            )}
                                            <td style={{ padding: '0.5rem 0.4rem' }}>{comment || '—'}</td>
                                        </tr>
                                        {expanded && (
                                            <SendingsTableExpandedRow
                                                {...props}
                                                row={row}
                                                rowKey={rowKey}
                                                parcelsToRender={parcelsToRender}
                                                hasParcelSearchMatches={hasParcelSearchMatches}
                                                sendingsAnalyticsExtraColCount={sendingsAnalyticsExtraColCount}
                                                plannedArrivalDate={plannedArrivalDate}
                                            />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </motion.div>
  );
}
