import { SendingPlanDateProgress } from "./PlanDateQueueStatus";
import React, { useState } from "react";
import { SendingTrackingDialog, extractContainerNumber } from "./SendingTrackingDialog";
import { SendingFerryDialog } from "./SendingFerryDialog";
import "./sendings-table.css";
import { motion } from "motion/react";

import { ArrowDown, ArrowUp, MapPin, PackageSearch } from "lucide-react";
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
  const [tracking, setTracking] = useState<{ id: number; name: string; provider: string; number: string } | null>(null);
  const [ferryOnMap, setFerryOnMap] = useState<{ mmsi: string; name: string } | null>(null);
  const sendingsAnalyticsExtraColCount = getSendingsAnalyticsExtraColCount(hasAnalytics, showSums);
  const columnWeights = [
    ...(canSelectSendingRows ? [28] : []),
    100, 65, 95, 45, 60, 105, 135, 120, 125,
    ...(hasAnalytics ? [70] : []),
    ...(hasAnalytics && showSums ? [95, 105] : []),
    110,
  ];
  const totalColumnWeight = columnWeights.reduce((sum, weight) => sum + weight, 0);
  return (
                <motion.div key="docs-send-table" className="documents-table-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
                <div className="cargo-card sendings-table-container" style={{ marginBottom: '1rem' }}>
                    <table className="sendings-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <colgroup>{columnWeights.map((weight, index) => <col key={index} style={{ width: `${weight / totalColumnWeight * 100}%` }} />)}</colgroup>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                {canSelectSendingRows && (
                                    <th style={{ padding: '0.5rem 0.35rem', textAlign: 'center', width: 34 }}>
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSendingsSelected}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setSelectedSendingRowKeys(() => (checked ? new Set(visibleSendingMeta.map((row: { rowKey: string }) => row.rowKey)) : new Set()));
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
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Выбор парома</th>
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
                                const ferryEntry = getSendingsFerryEntry(rowKey, number);
                                const selectedFerry = ferriesList.find((ferry: { id: number; mmsi: string; api_provider?: string | null }) => Number(ferry.id) === Number(ferryEntry?.ferry_id));
                                const trackingProvider = String(selectedFerry?.api_provider ?? ferryEntry?.api_provider ?? '').trim();
                                const ferryMmsi = String(selectedFerry?.mmsi ?? ferryEntry?.mmsi ?? '').trim().replace(/\D/g, '');
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
                                                <SendingPlanDateProgress row={row} fallback={plannedArrivalDate ? <DateText value={plannedArrivalDate.toISOString()} /> : 'нет'} />
                                            </td>
                                            <td style={{ padding: '0.5rem 0.4rem' }}>{vehicle || '—'}</td>
                                            <td style={{ padding: '0.5rem 0.4rem' }} onClick={(e) => e.stopPropagation()}>
                                                <div className="sendings-ferry-control">
                                                <select
                                                    aria-label={`Выбор парома для отправки ${number || rowKey}`}
                                                    value={ferryEntry?.ferry_id ?? ''}
                                                    disabled={!!ferryEtaLoadingByRow[rowKey]}
                                                    onChange={(e) => { void handleFerrySelect(rowKey, e.target.value, effectiveActiveInn ?? null); }}
                                                    style={{ width: '100%', minWidth: 0, maxWidth: '100%', padding: '0.35rem', color: 'var(--color-text-primary)', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 6 }}
                                                >
                                                    <option value="">Не выбран</option>
                                                    {ferryEntry && !ferriesList.some((ferry: { id: number }) => Number(ferry.id) === Number(ferryEntry.ferry_id)) && <option value={ferryEntry.ferry_id} disabled>{ferryEntry.ferry_name} (выключен)</option>}
                                                    {ferriesList.map((ferry: { id: number; name: string }) => <option key={ferry.id} value={ferry.id}>{ferry.name}</option>)}
                                                </select>
                                                {ferryEntry && (
                                                    <button
                                                        type="button"
                                                        className="sendings-ferry-map-icon"
                                                        aria-label={`Показать паром ${ferryEntry.ferry_name} на карте`}
                                                        title={ferryMmsi.length === 9 ? `Показать ${ferryEntry.ferry_name} на карте` : 'Для этого парома не указан MMSI'}
                                                        disabled={ferryMmsi.length !== 9}
                                                        onClick={() => setFerryOnMap({ mmsi: ferryMmsi, name: ferryEntry.ferry_name })}
                                                    ><MapPin size={18} aria-hidden="true" /></button>
                                                )}
                                                {ferryEntry && trackingProvider && <button type="button" className="sendings-ferry-map-icon" title={`Трекинг ${trackingProvider}`} aria-label={`Открыть трекинг ${trackingProvider} для отправки ${number}`} onClick={() => setTracking({ id: ferryEntry.ferry_id, name: ferryEntry.ferry_name, provider: trackingProvider, number: extractContainerNumber(vehicle) })}><PackageSearch size={18} aria-hidden="true" /></button>}
                                                </div>
                                            </td>
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
                {tracking && auth && <SendingTrackingDialog key={tracking.id + tracking.number} ferry={tracking} auth={auth} initialNumber={tracking.number} onClose={() => setTracking(null)} />}
                {ferryOnMap && <SendingFerryDialog key={ferryOnMap.mmsi} ferry={ferryOnMap} onClose={() => setFerryOnMap(null)} />}
                </motion.div>
  );
}
