import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { CargoTransportTypeIcon } from "../../../components/shared/CargoTableDisplay";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { AppBadge } from "../../../components/shared/AppBadge";
import { TapSwitch } from "../../../components/TapSwitch";
import { formatCurrency, stripOoo, formatInvoiceNumber, cityToCode } from "../../../lib/formatUtils";
import { STATUS_MAP, normalizeStatus } from "../../../lib/statusUtils";
import { formatSendingMetricNum, parseSendingMetricNumber } from "./sendingsMetrics";
import { normCargoKey } from "../lib/documentsPipeline";
import { DocumentsRouteBadge } from "../views/documentsViewBlocks";
import { SendingsBulkActionsBar } from "./SendingsBulkActionsBar";
import type { EorStatus } from "./sendingsTypes";
import type { SanctionCheckResult } from "../../../lib/sanctions";
import type { AuthData } from "../../../types";

export type SendingsSectionProps = {
  tableModeEffective: any;
  docsMotionEnabled: any;
  cargoModeSwitchMotion: any;
  canSelectSendingRows: any;
  allVisibleSendingsSelected: any;
  visibleSendingMeta: any;
  setSelectedSendingRowKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedSendingRowKeys: Set<string>;
  handleSendingsSort: (column: 'date' | 'number' | 'route' | 'type' | 'transitHours' | 'vehicle' | 'comment' | 'paidWeight' | 'cost' | 'declaredCost') => void;
  sendingsSortColumn: any;
  sendingsSortOrder: any;
  hasAnalytics: any;
  showSums: any;
  showEorColumn: any;
  canEditEor: any;
  canEditPlanDate: any;
  canRunSanctionsCheck: any;
  sendingRowsSorted: any;
  normalizeTransportDisplay: any;
  getSendingRowKey: any;
  getRequestParcels: any;
  effectiveSearchText: any;
  getParcelSearchText: any;
  getSendingRowTransportMode: any;
  getSendingStatusKey: any;
  getSendingTransitHours: any;
  getSendingTransitIsFinal: any;
  getSendingPlannedArrivalDate: any;
  expandedSendingRow: any;
  setExpandedSendingRow: React.Dispatch<React.SetStateAction<string | null>>;
  getSendingRowParcelMetrics: any;
  cargoSumByNumber: any;
  sendingSanctionMap: Record<string, SanctionCheckResult>;
  renderSanctionBadge: (result: SanctionCheckResult | null) => React.ReactNode;
  eorStatusMap: any;
  ferriesList: any;
  sendingsFerryMap: any;
  ferryEtaLoadingByRow: any;
  handleFerrySelect: (rowKey: string, ferryIdStr: string, effectiveInn: string | null) => Promise<void>;
  effectiveActiveInn: any;
  getSendingsFerryEntry: any;
  onOpenAisWithMmsi: (mmsi: string) => void;
  onOpenCargo: (cargoNumber: string) => void;
  sendingsDetailsView: any;
  setSendingsDetailsView: React.Dispatch<React.SetStateAction<'general' | 'byCargo' | 'byCustomer'>>;
  sendingsSummaryGroupBy: any;
  setSendingsSummaryGroupBy: React.Dispatch<React.SetStateAction<'customer' | 'receiver'>>;
  sendingsSummarySortColumn: any;
  sendingsSummarySortOrder: any;
  handleSendingsSummarySort: (column: 'index' | 'cargo' | 'status' | 'count' | 'volume' | 'weight' | 'paidWeight' | 'customer' | 'density') => void;
  sendingsAnalyticsExtraColCount: any;
  cargoStateByNumber: any;
  cargoPlanDateByNumber: Map<string, string>;
  cargoReceiverByNumber: any;
  cargoCustomerByNumber: any;
  showCustomerColumn: any;
  effectiveServiceMode: any;
  selectedByCustomerSummaryKeys: any;
  setSelectedByCustomerSummaryKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedByCustomerKey: any;
  setExpandedByCustomerKey: React.Dispatch<React.SetStateAction<string | null>>;
  byCustomerPlanDateOpen: any;
  setByCustomerPlanDateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  byCustomerPlanDateValue: any;
  setByCustomerPlanDateValue: React.Dispatch<React.SetStateAction<string>>;
  byCustomerActionLoading: any;
  setByCustomerActionLoading: React.Dispatch<React.SetStateAction<boolean>>;
  byCustomerActionError: any;
  setByCustomerActionError: React.Dispatch<React.SetStateAction<string | null>>;
  byCustomerActionInfo: any;
  setByCustomerActionInfo: React.Dispatch<React.SetStateAction<string | null>>;
  pickNomenclatureText: any;
  getParcelTnvedCode: any;
  getParcelSanctionResult: any;
  getParcelFreightSum: any;
  getParcelDeclaredCost: any;
  selectedVisibleSendingCount: any;
  bulkSendingActionLoading: any;
  bulkEorMenuOpen: any;
  setBulkEorMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bulkPlanDateOpen: any;
  setBulkPlanDateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bulkPlanDateValue: any;
  setBulkPlanDateValue: React.Dispatch<React.SetStateAction<string>>;
  bulkSendingActionError: any;
  bulkSendingActionInfo: any;
  applyBulkEorStatus: (status: EorStatus) => void;
  applyBulkPlanDate: () => void;
  applyBulkSanctionsCheck: () => void;
  auth: AuthData | null | undefined;
  postSendingsPlanDate: any;
};

export function SendingsSection({
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
  normalizeTransportDisplay,
  getSendingRowKey,
  getRequestParcels,
  effectiveSearchText,
  getParcelSearchText,
  getSendingRowTransportMode,
  getSendingStatusKey,
  getSendingTransitHours,
  getSendingTransitIsFinal,
  getSendingPlannedArrivalDate,
  expandedSendingRow,
  setExpandedSendingRow,
  getSendingRowParcelMetrics,
  cargoSumByNumber,
  sendingSanctionMap,
  renderSanctionBadge,
  eorStatusMap,
  ferriesList,
  sendingsFerryMap,
  ferryEtaLoadingByRow,
  handleFerrySelect,
  effectiveActiveInn,
  getSendingsFerryEntry,
  onOpenAisWithMmsi,
  onOpenCargo,
  sendingsDetailsView,
  setSendingsDetailsView,
  sendingsSummaryGroupBy,
  setSendingsSummaryGroupBy,
  sendingsSummarySortColumn,
  sendingsSummarySortOrder,
  handleSendingsSummarySort,
  sendingsAnalyticsExtraColCount,
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
  pickNomenclatureText,
  getParcelTnvedCode,
  getParcelSanctionResult,
  getParcelFreightSum,
  getParcelDeclaredCost,
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
  auth,
  postSendingsPlanDate,
}: SendingsSectionProps) {
  return (
                <AnimatePresence mode="wait">
                {tableModeEffective ? (
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
                                {hasAnalytics && (
                                    <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Санкции</th>
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
                                const sendingStatusKey = getSendingStatusKey(row);
                                const sendingStatusLabel = sendingStatusKey === 'all' ? '' : STATUS_MAP[sendingStatusKey];
                                const transitHours = getSendingTransitHours(row);
                                const transitDays = transitHours == null ? null : Math.round((transitHours / 24) * 10) / 10;
                                const isFinalTransit = getSendingTransitIsFinal(row);
                                const plannedArrivalDate = getSendingPlannedArrivalDate(row);
                                const routeFrom = String(row?.ПунктОтправленияГородАэропорт ?? row?.CitySender ?? row?.ГородОтправления ?? '').trim();
                                const routeTo = String(row?.ПунктНазначенияГородАэропорт ?? row?.CityReceiver ?? row?.ГородНазначения ?? '').trim();
                                const route = [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(' – ') || [routeFrom, routeTo].filter(Boolean).join(' – ') || '—';
                                const expanded = expandedSendingRow === rowKey;
                                const sendingParcelMetrics = getSendingRowParcelMetrics(row, cargoSumByNumber);
                                const rowSanctionResult = sendingSanctionMap[rowKey];
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
                                            {hasAnalytics && (
                                                <td style={{ padding: '0.5rem 0.4rem', whiteSpace: 'nowrap' }}>
                                                    {renderSanctionBadge(rowSanctionResult)}
                                                </td>
                                            )}
                                            <td style={{ padding: '0.5rem 0.4rem' }}>{comment || '—'}</td>
                                        </tr>
                                        {expanded && (
                                            <tr>
                                                <td colSpan={9 + sendingsAnalyticsExtraColCount + (canSelectSendingRows ? 1 : 0)} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                    <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'general' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'general' ? '#fff' : undefined }}
                                                                onClick={(e) => { e.stopPropagation(); setSendingsDetailsView('general'); }}
                                                            >
                                                                Общий
                                                            </Button>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCargo' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCargo' ? '#fff' : undefined }}
                                                                onClick={(e) => { e.stopPropagation(); setSendingsDetailsView('byCargo'); }}
                                                            >
                                                                По перевозкам
                                                            </Button>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'customer' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'customer' ? '#fff' : undefined }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSendingsDetailsView('byCustomer');
                                                                    setSendingsSummaryGroupBy('customer');
                                                                    setSendingsSummarySortColumn('customer');
                                                                    setSendingsSummarySortOrder('asc');
                                                                }}
                                                            >
                                                                По заказчику
                                                            </Button>
                                                            <Button
                                                                className="filter-button"
                                                                style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'receiver' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'receiver' ? '#fff' : undefined }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSendingsDetailsView('byCustomer');
                                                                    setSendingsSummaryGroupBy('receiver');
                                                                    setSendingsSummarySortColumn('customer');
                                                                    setSendingsSummarySortOrder('asc');
                                                                }}
                                                            >
                                                                По получателю
                                                            </Button>
                                                        </div>
                                                        {parcelsToRender.length === 0 ? (
                                                            <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.5rem 0.25rem' }}>Нет данных по посылкам</Typography.Body>
                                                        ) : sendingsDetailsView === 'general' ? (
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>№ пп</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Перевозка</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Посылка</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Консолидация</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Вес</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Объем</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Платный вес</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Номенклатура</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>ТН ВЭД</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Санкции</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>Кол-во</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }} title="Сумма за перевозку">Стоимость</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>Объявл. стоимость</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {parcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                                        const goodsRaw = parcel?.Товары;
                                                                        const goods = Array.isArray(goodsRaw) ? goodsRaw[0] : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : {});
                                                                        const parcelNomenclature = pickNomenclatureText(parcel) || String(goods?.ТМЦ ?? '');
                                                                        const parcelSanctionResult = getParcelSanctionResult(parcel);
                                                                        return (
                                                                            <tr
                                                                                key={`${rowKey}-parcel-${parcel?.Посылка ?? parcelIdx}`}
                                                                                style={{
                                                                                    borderBottom: '1px solid var(--color-border)',
                                                                                    background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                }}
                                                                            >
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{goods?.ИДОтправления ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}><ClickableCargoNumber number={parcel?.Перевозка} onOpen={onOpenCargo} /></td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ВесДляОтчета ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ОбъемДляОтчета ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{(() => { const w = parseSendingMetricNumber(parcel?.ПлатныйВес); return w > 0 ? formatSendingMetricNum(w) : '—'; })()}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem' }}>{parcelNomenclature || '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{getParcelTnvedCode(parcel) || '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{renderSanctionBadge(rowSanctionResult ? parcelSanctionResult : null)}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{(() => { const sum = getParcelFreightSum(parcel, cargoSumByNumber); return sum > 0 ? formatCurrency(sum, true) : '—'; })()}</td>
                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{(() => { const sum = getParcelDeclaredCost(parcel); return sum > 0 ? formatCurrency(sum, true) : '—'; })()}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        ) : sendingsDetailsView === 'byCargo' ? (
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('index')} title="Сортировка">№ пп {sendingsSummarySortColumn === 'index' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('cargo')} title="Сортировка">Консолидация {sendingsSummarySortColumn === 'cargo' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('status')} title="Сортировка">Статус {sendingsSummarySortColumn === 'status' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('count')} title="Сортировка">Кол-во {sendingsSummarySortColumn === 'count' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('volume')} title="Сортировка">Объем {sendingsSummarySortColumn === 'volume' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('weight')} title="Сортировка">Вес {sendingsSummarySortColumn === 'weight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('paidWeight')} title="Сортировка">Платный вес {sendingsSummarySortColumn === 'paidWeight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('customer')} title="Сортировка">Заказчик {sendingsSummarySortColumn === 'customer' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, lineHeight: 1.15 }}>Плановая дата прибытия<br />на терминал</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(() => {
                                                                        const toNumber = (v: unknown) => {
                                                                            const raw = String(v ?? '').trim().replace(',', '.');
                                                                            const n = Number(raw);
                                                                            return Number.isFinite(n) ? n : 0;
                                                                        };
                                                                        const formatNum = (n: number) => {
                                                                            if (!Number.isFinite(n)) return '—';
                                                                            return String(Math.round(n));
                                                                        };
                                                                        const byCargo = new Map<string, { cargo: string; status: string; count: number; volume: number; weight: number; paidWeight: number }>();
                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                            const cargo = String(parcel?.Перевозка ?? '').trim() || '—';
                                                                            const prev = byCargo.get(cargo) ?? { cargo, status: '', count: 0, volume: 0, weight: 0, paidWeight: 0 };
                                                                            prev.count += 1;
                                                                            prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                            prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                            prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                            if (!prev.status || prev.status === '-') {
                                                                                const state = cargo !== '—' ? String(cargoStateByNumber.get(normCargoKey(cargo)) ?? '') : '';
                                                                                prev.status = state || prev.status;
                                                                            }
                                                                            byCargo.set(cargo, prev);
                                                                        });
                                                                        const summaryRows = Array.from(byCargo.values()).map((summary, index) => {
                                                                            const cargoKey = normCargoKey(summary.cargo);
                                                                            const sendingCustomer = cargoCustomerByNumber.get(cargoKey)
                                                                                || String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '');
                                                                            return { ...summary, status: normalizeStatus(summary.status || ''), customer: sendingCustomer, _index: index + 1 };
                                                                        });
                                                                        const sortedSummaryRows = [...summaryRows].sort((a, b) => {
                                                                            let cmp = 0;
                                                                            switch (sendingsSummarySortColumn) {
                                                                                case 'index':
                                                                                    cmp = a._index - b._index;
                                                                                    break;
                                                                                case 'cargo':
                                                                                    cmp = a.cargo.localeCompare(b.cargo, undefined, { numeric: true });
                                                                                    break;
                                                                                case 'status':
                                                                                    cmp = String(a.status || '').localeCompare(String(b.status || ''), 'ru');
                                                                                    break;
                                                                                case 'count':
                                                                                    cmp = a.count - b.count;
                                                                                    break;
                                                                                case 'volume':
                                                                                    cmp = a.volume - b.volume;
                                                                                    break;
                                                                                case 'weight':
                                                                                    cmp = a.weight - b.weight;
                                                                                    break;
                                                                                case 'paidWeight':
                                                                                    cmp = a.paidWeight - b.paidWeight;
                                                                                    break;
                                                                                case 'density': {
                                                                                    const dA = a.volume > 0 ? a.weight / a.volume : -Infinity;
                                                                                    const dB = b.volume > 0 ? b.weight / b.volume : -Infinity;
                                                                                    cmp = dA - dB;
                                                                                    break;
                                                                                }
                                                                                case 'customer':
                                                                                    cmp = String(a.customer || '').localeCompare(String(b.customer || ''));
                                                                                    break;
                                                                            }
                                                                            return sendingsSummarySortOrder === 'asc' ? cmp : -cmp;
                                                                        });
                                                                        const totals = summaryRows.reduce(
                                                                            (acc, s) => {
                                                                                acc.count += s.count;
                                                                                acc.volume += s.volume;
                                                                                acc.weight += s.weight;
                                                                                acc.paidWeight += s.paidWeight;
                                                                                return acc;
                                                                            },
                                                                            { count: 0, volume: 0, weight: 0, paidWeight: 0 }
                                                                        );
                                                                        return (
                                                                            <>
                                                                                {sortedSummaryRows.map((summary, parcelIdx: number) => {
                                                                                    return (
                                                                                        <tr
                                                                                            key={`${rowKey}-summary-${summary.cargo}-${parcelIdx}`}
                                                                                            style={{
                                                                                                borderBottom: '1px solid var(--color-border)',
                                                                                                background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                                            }}
                                                                                        >
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>
                                                                                                <ClickableCargoNumber number={summary.cargo} onOpen={onOpenCargo} title="Открыть карточку перевозки" />
                                                                                            </td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem' }}><StatusBadge status={summary.status || '—'} /></td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{summary.count}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.volume)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.weight)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.paidWeight)}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem' }}>{stripOoo(summary.customer) || '—'}</td>
                                                                                            <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{(() => {
                                                                                                const planDate = summary.cargo && summary.cargo !== '—'
                                                                                                    ? (cargoPlanDateByNumber.get(normCargoKey(summary.cargo)) ?? cargoPlanDateByNumber.get(summary.cargo) ?? plannedArrivalDate)
                                                                                                    : plannedArrivalDate;
                                                                                                return planDate ? <DateText value={planDate.toISOString()} /> : 'нет';
                                                                                            })()}</td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                                <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 700 }} colSpan={3}>Итого</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{totals.count}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.volume)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.weight)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{formatNum(totals.paidWeight)}</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', fontWeight: 700 }}>—</td>
                                                                                    <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap', fontWeight: 700 }}>{plannedArrivalDate ? <DateText value={plannedArrivalDate.toISOString()} /> : 'нет'}</td>
                                                                                </tr>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <>
                                                            {(() => {
                                                                const toNumber = (v: unknown) => {
                                                                    const raw = String(v ?? '').trim().replace(',', '.');
                                                                    const n = Number(raw);
                                                                    return Number.isFinite(n) ? n : 0;
                                                                };
                                                                const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                const rowDefaultReceiver = String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '').trim() || '—';
                                                                const byCounterparty = new Map<string, { party: string; count: number; volume: number; weight: number; paidWeight: number; cargoNumbers: Set<string> }>();
                                                                parcelsToRender.forEach((parcel: any) => {
                                                                    const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                    const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                    const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                    const receiverFromParcel = String(parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? '').trim();
                                                                    const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                    const party = sendingsSummaryGroupBy === 'receiver'
                                                                        ? (receiverFromParcel || receiverFromCargo || rowDefaultReceiver)
                                                                        : (customerFromParcel || customerFromCargo || rowDefaultCustomer);
                                                                    const prev = byCounterparty.get(party) ?? { party, count: 0, volume: 0, weight: 0, paidWeight: 0, cargoNumbers: new Set<string>() };
                                                                    prev.count += 1;
                                                                    prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                    prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                    prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                    if (cargo) prev.cargoNumbers.add(cargo);
                                                                    byCounterparty.set(party, prev);
                                                                });
                                                                const summaryRows = Array.from(byCounterparty.values()).map((summary, index) => ({
                                                                    ...summary,
                                                                    _index: index + 1,
                                                                    selectionKey: `${rowKey}::${summary.party}`,
                                                                    cargoNumbers: Array.from(summary.cargoNumbers),
                                                                }));
                                                                const selectedSummaryRows = summaryRows.filter((summary) => selectedByCustomerSummaryKeys.has(summary.selectionKey));
                                                                const selectedByCustomerCount = selectedSummaryRows.length;
                                                                return (
                                                                    <>
                                                                        {canEditPlanDate && (
                                                                            <div className="cargo-card" style={{ padding: '0.45rem 0.6rem', marginBottom: '0.5rem', overflow: 'visible', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-primary)' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                                                                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                                                                        Выбрано {sendingsSummaryGroupBy === 'receiver' ? 'получателей' : 'заказчиков'}: {selectedByCustomerCount}
                                                                                    </Typography.Body>
                                                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', position: 'relative' }}>
                                                                                        <Button
                                                                                            type="button"
                                                                                            className="filter-button"
                                                                                            disabled={byCustomerActionLoading || selectedByCustomerCount === 0}
                                                                                            onClick={() => setByCustomerPlanDateOpen((prev) => !prev)}
                                                                                            style={{ minWidth: 'auto', padding: '0.35rem 0.6rem' }}
                                                                                        >
                                                                                            {byCustomerActionLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: 4 }} /> : null}
                                                                                            Плановая дата прибытия на терминал
                                                                                        </Button>
                                                                                        {byCustomerPlanDateOpen && (
                                                                                            <div
                                                                                                style={{
                                                                                                    position: 'absolute',
                                                                                                    top: 'calc(100% + 6px)',
                                                                                                    left: 0,
                                                                                                    zIndex: 12000,
                                                                                                    minWidth: 220,
                                                                                                    border: '1px solid var(--color-border)',
                                                                                                    borderRadius: 8,
                                                                                                    background: 'var(--color-bg-card)',
                                                                                                    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.16)',
                                                                                                    padding: '0.5rem',
                                                                                                    display: 'flex',
                                                                                                    flexDirection: 'column',
                                                                                                    gap: '0.4rem',
                                                                                                }}
                                                                                            >
                                                                                                <input
                                                                                                    type="date"
                                                                                                    value={byCustomerPlanDateValue}
                                                                                                    onChange={(e) => setByCustomerPlanDateValue(e.target.value)}
                                                                                                    className="admin-form-input"
                                                                                                />
                                                                                                <Button
                                                                                                    type="button"
                                                                                                    className="button-primary"
                                                                                                    style={{ minWidth: 'auto', padding: '0.35rem 0.55rem' }}
                                                                                                    disabled={byCustomerActionLoading || !byCustomerPlanDateValue}
                                                                                                    onClick={async () => {
                                                                                                        if (!byCustomerPlanDateValue) {
                                                                                                            setByCustomerActionError('Укажите плановую дату прибытия на терминал.');
                                                                                                            return;
                                                                                                        }
                                                                                                        const cargoNumbers = Array.from(new Set(
                                                                                                            selectedSummaryRows
                                                                                                                .flatMap((summary) => summary.cargoNumbers.map((cargo) => String(cargo).trim()))
                                                                                                                .filter(Boolean)
                                                                                                        ));
                                                                                                        if (cargoNumbers.length === 0) {
                                                                                                            setByCustomerActionError(sendingsSummaryGroupBy === 'receiver' ? 'По выбранным получателям не найдены номера перевозок.' : 'По выбранным заказчикам не найдены номера перевозок.');
                                                                                                            return;
                                                                                                        }
                                                                                                        setByCustomerActionLoading(true);
                                                                                                        setByCustomerActionError(null);
                                                                                                        setByCustomerActionInfo(null);
                                                                                                        try {
                                                                                                            const data = await postSendingsPlanDate(
                                                                                                                byCustomerPlanDateValue,
                                                                                                                cargoNumbers
                                                                                                            );
                                                                                                            const updated = Number(data?.updated ?? 0);
                                                                                                            const requested = Number(data?.requested ?? cargoNumbers.length);
                                                                                                            const failed = Number(data?.failed ?? Math.max(0, requested - updated));
                                                                                                            const firstError = Array.isArray(data?.errors) && data.errors.length > 0
                                                                                                                ? String(data.errors[0]?.error || '').trim()
                                                                                                                : '';
                                                                                                            if (failed > 0) {
                                                                                                                setByCustomerActionError(`Плановая дата прибытия на терминал записана частично: ${updated} из ${requested}.${firstError ? ` Причина: ${firstError}` : ''}`);
                                                                                                            } else {
                                                                                                                setByCustomerActionInfo(`Плановая дата прибытия на терминал ${byCustomerPlanDateValue} записана для ${updated} перевозок.`);
                                                                                                            }
                                                                                                            setByCustomerPlanDateOpen(false);
                                                                                                        } catch (e: any) {
                                                                                                            setByCustomerActionError(String(e?.message || 'Не удалось записать плановую дату прибытия на терминал.'));
                                                                                                        } finally {
                                                                                                            setByCustomerActionLoading(false);
                                                                                                        }
                                                                                                    }}
                                                                                                >
                                                                                                    Записать
                                                                                                </Button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                {(byCustomerActionError || byCustomerActionInfo) && (
                                                                                    <Typography.Body style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: byCustomerActionError ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                                                                                        {byCustomerActionError || byCustomerActionInfo}
                                                                                    </Typography.Body>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                        {canEditPlanDate && (
                                                                            <th style={{ padding: '0.35rem 0.25rem', textAlign: 'center', width: 30 }}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={(() => {
                                                                                        const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                                        const rowDefaultReceiver = String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '').trim() || '—';
                                                                                        const parties = new Set<string>();
                                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                                            const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                                            const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                                            const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                                            const receiverFromParcel = String(parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? '').trim();
                                                                                            const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                                            const party = sendingsSummaryGroupBy === 'receiver'
                                                                                                ? (receiverFromParcel || receiverFromCargo || rowDefaultReceiver)
                                                                                                : (customerFromParcel || customerFromCargo || rowDefaultCustomer);
                                                                                            parties.add(`${rowKey}::${party}`);
                                                                                        });
                                                                                        if (parties.size === 0) return false;
                                                                                        for (const key of parties) {
                                                                                            if (!selectedByCustomerSummaryKeys.has(key)) return false;
                                                                                        }
                                                                                        return true;
                                                                                    })()}
                                                                                    onChange={(e) => {
                                                                                        const checked = e.target.checked;
                                                                                        const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                                        const rowDefaultReceiver = String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '').trim() || '—';
                                                                                        const keys = new Set<string>();
                                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                                            const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                                            const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                                            const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                                            const receiverFromParcel = String(parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? '').trim();
                                                                                            const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                                            const party = sendingsSummaryGroupBy === 'receiver'
                                                                                                ? (receiverFromParcel || receiverFromCargo || rowDefaultReceiver)
                                                                                                : (customerFromParcel || customerFromCargo || rowDefaultCustomer);
                                                                                            keys.add(`${rowKey}::${party}`);
                                                                                        });
                                                                                        setSelectedByCustomerSummaryKeys((prev) => {
                                                                                            const next = new Set(prev);
                                                                                            keys.forEach((key) => {
                                                                                                if (checked) next.add(key);
                                                                                                else next.delete(key);
                                                                                            });
                                                                                            return next;
                                                                                        });
                                                                                    }}
                                                                                    aria-label={sendingsSummaryGroupBy === 'receiver' ? 'Выбрать всех получателей' : 'Выбрать всех заказчиков'}
                                                                                />
                                                                            </th>
                                                                        )}
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('index')} title="Сортировка">№ пп {sendingsSummarySortColumn === 'index' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('customer')} title="Сортировка">{sendingsSummaryGroupBy === 'receiver' ? 'Получатель' : 'Заказчик'} {sendingsSummarySortColumn === 'customer' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('count')} title="Сортировка">Кол-во {sendingsSummarySortColumn === 'count' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('volume')} title="Сортировка">Объем {sendingsSummarySortColumn === 'volume' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('weight')} title="Сортировка">Вес {sendingsSummarySortColumn === 'weight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('paidWeight')} title="Сортировка">Платный вес {sendingsSummarySortColumn === 'paidWeight' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSendingsSummarySort('density')} title="Сортировка">Плотность {sendingsSummarySortColumn === 'density' && (sendingsSummarySortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                                        <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, lineHeight: 1.15 }}>Плановая дата прибытия<br />на терминал</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(() => {
                                                                        const toNumber = (v: unknown) => {
                                                                            const raw = String(v ?? '').trim().replace(',', '.');
                                                                            const n = Number(raw);
                                                                            return Number.isFinite(n) ? n : 0;
                                                                        };
                                                                        const formatNum = (n: number) => {
                                                                            if (!Number.isFinite(n)) return '—';
                                                                            return String(Math.round(n));
                                                                        };
                                                                        const densityOf = (weight: number, volume: number) => {
                                                                            if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume <= 0) return '—';
                                                                            return formatNum(weight / volume);
                                                                        };
                                                                        const densityColor = (weight: number, volume: number) => {
                                                                            if (!Number.isFinite(weight) || !Number.isFinite(volume) || volume <= 0) return 'var(--color-text-secondary)';
                                                                            const density = weight / volume;
                                                                            if (density >= 180 && density <= 220) return '#16a34a';
                                                                            if ((density >= 150 && density < 180) || (density > 220 && density <= 260)) return '#ca8a04';
                                                                            return '#dc2626';
                                                                        };
                                                                        const rowDefaultCustomer = String(row?.Заказчик ?? row?.Customer ?? row?.customer ?? row?.Контрагент ?? row?.Contractor ?? row?.Organization ?? '').trim() || '—';
                                                                        const rowDefaultReceiver = String(row?.Получатель ?? row?.Грузополучатель ?? row?.Receiver ?? row?.receiver ?? row?.Consignee ?? '').trim() || '—';
                                                                        const byCounterparty = new Map<string, { party: string; count: number; volume: number; weight: number; paidWeight: number; cargoNumbers: Set<string> }>();
                                                                        parcelsToRender.forEach((parcel: any) => {
                                                                            const cargo = String(parcel?.Перевозка ?? '').trim();
                                                                            const customerFromParcel = String(parcel?.ЗаказчикНаименование ?? parcel?.Заказчик ?? parcel?.Customer ?? parcel?.customer ?? '').trim();
                                                                            const customerFromCargo = cargo ? String(cargoCustomerByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                            const receiverFromParcel = String(parcel?.ПолучательНаименование ?? parcel?.Получатель ?? parcel?.ГрузополучательНаименование ?? parcel?.Грузополучатель ?? parcel?.Receiver ?? parcel?.receiver ?? parcel?.Consignee ?? '').trim();
                                                                            const receiverFromCargo = cargo ? String(cargoReceiverByNumber.get(normCargoKey(cargo)) ?? '').trim() : '';
                                                                            const party = sendingsSummaryGroupBy === 'receiver'
                                                                                ? (receiverFromParcel || receiverFromCargo || rowDefaultReceiver)
                                                                                : (customerFromParcel || customerFromCargo || rowDefaultCustomer);
                                                                            const prev = byCounterparty.get(party) ?? { party, count: 0, volume: 0, weight: 0, paidWeight: 0, cargoNumbers: new Set<string>() };
                                                                            prev.count += 1;
                                                                            prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                            prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                            prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                            if (cargo) prev.cargoNumbers.add(cargo);
                                                                            byCounterparty.set(party, prev);
                                                                        });
                                                                        const summaryRows = Array.from(byCounterparty.values()).map((summary, index) => ({
                                                                            ...summary,
                                                                            _index: index + 1,
                                                                            selectionKey: `${rowKey}::${summary.party}`,
                                                                            cargoNumbers: Array.from(summary.cargoNumbers),
                                                                        }));
                                                                        const sortedSummaryRows = [...summaryRows].sort((a, b) => {
                                                                            let cmp = 0;
                                                                            switch (sendingsSummarySortColumn) {
                                                                                case 'index':
                                                                                    cmp = a._index - b._index;
                                                                                    break;
                                                                                case 'count':
                                                                                    cmp = a.count - b.count;
                                                                                    break;
                                                                                case 'volume':
                                                                                    cmp = a.volume - b.volume;
                                                                                    break;
                                                                                case 'weight':
                                                                                    cmp = a.weight - b.weight;
                                                                                    break;
                                                                                case 'paidWeight':
                                                                                    cmp = a.paidWeight - b.paidWeight;
                                                                                    break;
                                                                                case 'density': {
                                                                                    const dA = a.volume > 0 ? a.weight / a.volume : -Infinity;
                                                                                    const dB = b.volume > 0 ? b.weight / b.volume : -Infinity;
                                                                                    cmp = dA - dB;
                                                                                    break;
                                                                                }
                                                                                case 'cargo':
                                                                                case 'customer':
                                                                                    cmp = String(a.party || '').localeCompare(String(b.party || ''));
                                                                                    break;
                                                                            }
                                                                            return sendingsSummarySortOrder === 'asc' ? cmp : -cmp;
                                                                        });
                                                                        const totals = summaryRows.reduce(
                                                                            (acc, s) => {
                                                                                acc.count += s.count;
                                                                                acc.volume += s.volume;
                                                                                acc.weight += s.weight;
                                                                                acc.paidWeight += s.paidWeight;
                                                                                return acc;
                                                                            },
                                                                            { count: 0, volume: 0, weight: 0, paidWeight: 0 }
                                                                        );
                                                                        const stickyTotalsCellBase: React.CSSProperties = {
                                                                            padding: '0.35rem 0.3rem',
                                                                            position: 'sticky',
                                                                            bottom: 0,
                                                                            background: 'var(--color-bg-hover)',
                                                                            fontWeight: 700,
                                                                            borderTop: '2px solid var(--color-border)',
                                                                            zIndex: 3,
                                                                        };
                                                                        return (
                                                                            <>
                                                                                {sortedSummaryRows.map((summary, parcelIdx: number) => {
                                                                                    const isExpanded = expandedByCustomerKey === summary.selectionKey;
                                                                                    const cargoNumbersSet = new Set(summary.cargoNumbers.map((c: string) => normCargoKey(c)));
                                                                                    const parcelsForParty = parcelsToRender.filter((p: any) => {
                                                                                        const cargo = String(p?.Перевозка ?? '').trim();
                                                                                        return cargo && cargoNumbersSet.has(normCargoKey(cargo));
                                                                                    });
                                                                                    const byCargoExpanded = new Map<string, { cargo: string; status: string; count: number; volume: number; weight: number; paidWeight: number }>();
                                                                                    parcelsForParty.forEach((parcel: any) => {
                                                                                        const cargo = String(parcel?.Перевозка ?? '').trim() || '—';
                                                                                        const prev = byCargoExpanded.get(cargo) ?? { cargo, status: '', count: 0, volume: 0, weight: 0, paidWeight: 0 };
                                                                                        prev.count += 1;
                                                                                        prev.volume += toNumber(parcel?.ОбъемДляОтчета);
                                                                                        prev.weight += toNumber(parcel?.ВесДляОтчета);
                                                                                        prev.paidWeight += toNumber(parcel?.ПлатныйВес);
                                                                                        if (!prev.status || prev.status === '-') {
                                                                                            const state = cargo !== '—' ? String(cargoStateByNumber.get(normCargoKey(cargo)) ?? '') : '';
                                                                                            prev.status = state || prev.status;
                                                                                        }
                                                                                        byCargoExpanded.set(cargo, prev);
                                                                                    });
                                                                                    const cargoRows = Array.from(byCargoExpanded.values()).map((s, i) => {
                                                                                        const cargoKey = normCargoKey(s.cargo);
                                                                                        const sendingCustomer = cargoCustomerByNumber.get(cargoKey) || String(row?.Заказчик ?? row?.Customer ?? '').trim();
                                                                                        const sendingReceiver = cargoReceiverByNumber.get(cargoKey) || String(row?.Получатель ?? row?.Грузополучатель ?? '').trim();
                                                                                        const partyName = sendingsSummaryGroupBy === 'receiver' ? sendingReceiver : sendingCustomer;
                                                                                        return { ...s, status: normalizeStatus(s.status || ''), partyName, _idx: i + 1 };
                                                                                    });
                                                                                    return (
                                                                                        <React.Fragment key={`${rowKey}-summary-customer-${summary.party}-${parcelIdx}`}>
                                                                                            <tr
                                                                                                style={{
                                                                                                    borderBottom: '1px solid var(--color-border)',
                                                                                                    background: isExpanded ? 'var(--color-bg-hover)' : (hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined),
                                                                                                    cursor: 'pointer',
                                                                                                }}
                                                                                                onClick={() => setExpandedByCustomerKey((prev) => (prev === summary.selectionKey ? null : summary.selectionKey))}
                                                                                                title={isExpanded ? 'Свернуть перевозки' : 'Показать перевозки'}
                                                                                            >
                                                                                                {canEditPlanDate && (
                                                                                                    <td style={{ padding: '0.35rem 0.25rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            checked={selectedByCustomerSummaryKeys.has(summary.selectionKey)}
                                                                                                            onChange={(e) => {
                                                                                                                const checked = e.target.checked;
                                                                                                                setSelectedByCustomerSummaryKeys((prev) => {
                                                                                                                    const next = new Set(prev);
                                                                                                                    if (checked) next.add(summary.selectionKey);
                                                                                                                    else next.delete(summary.selectionKey);
                                                                                                                    return next;
                                                                                                                });
                                                                                                            }}
                                                                                                            aria-label={`Выбрать ${sendingsSummaryGroupBy === 'receiver' ? 'получателя' : 'заказчика'} ${summary.party || parcelIdx + 1}`}
                                                                                                        />
                                                                                                    </td>
                                                                                                )}
                                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcelIdx + 1}</td>
                                                                                                <td style={{ padding: '0.35rem 0.3rem' }}>
                                                                                                    {stripOoo(summary.party) || '—'}
                                                                                                    {summary.cargoNumbers.length > 0 && (
                                                                                                        <span style={{ marginLeft: '0.25rem', color: 'var(--color-text-secondary)', fontSize: '0.75em' }} title={isExpanded ? 'Свернуть' : 'Показать перевозки'}>
                                                                                                            {isExpanded ? '▼' : '▶'}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </td>
                                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{summary.count}</td>
                                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.volume)}</td>
                                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.weight)}</td>
                                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(summary.paidWeight)}</td>
                                                                                                <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap', color: densityColor(summary.weight, summary.volume), fontWeight: 600 }}>{densityOf(summary.weight, summary.volume)}</td>
                                                                                                <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{(() => {
                                                                                                    const planDates = summary.cargoNumbers
                                                                                                        .flatMap((c: string) => [cargoPlanDateByNumber.get(normCargoKey(c)), cargoPlanDateByNumber.get(c)])
                                                                                                        .filter((d): d is Date => !!d);
                                                                                                    const planDate = planDates.length > 0
                                                                                                        ? planDates.reduce((min, d) => d.getTime() < min.getTime() ? d : min, planDates[0])
                                                                                                        : plannedArrivalDate;
                                                                                                    return planDate ? <DateText value={planDate.toISOString()} /> : 'нет';
                                                                                                })()}</td>
                                                                                            </tr>
                                                                                            {isExpanded && cargoRows.length > 0 && (
                                                                                                <tr>
                                                                                                    <td colSpan={canEditPlanDate ? 9 : 8} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                                                                        <div style={{ padding: '0.35rem 0.5rem 0.5rem', paddingLeft: '1.5rem' }}>
                                                                                                            <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                                                                                <thead>
                                                                                                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>№ пп</th>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'left', fontWeight: 600 }}>Консолидация</th>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>Кол-во</th>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'right', fontWeight: 600 }}>Объем</th>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'right', fontWeight: 600 }}>Вес</th>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'right', fontWeight: 600 }}>Платный вес</th>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'left', fontWeight: 600 }}>{sendingsSummaryGroupBy === 'receiver' ? 'Получатель' : 'Заказчик'}</th>
                                                                                                                        <th style={{ padding: '0.3rem 0.25rem', textAlign: 'left', fontWeight: 600, lineHeight: 1.15 }}>Плановая дата прибытия<br />на терминал</th>
                                                                                                                    </tr>
                                                                                                                </thead>
                                                                                                                <tbody>
                                                                                                                    {cargoRows.map((cr, crIdx) => (
                                                                                                                        <tr key={`${rowKey}-cargo-${cr.cargo}-${crIdx}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{cr._idx}</td>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem', whiteSpace: 'nowrap' }}>
                                                                                                                                <ClickableCargoNumber number={cr.cargo} onOpen={onOpenCargo} title="Открыть карточку перевозки" />
                                                                                                                            </td>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem' }}><StatusBadge status={cr.status || '—'} /></td>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{cr.count}</td>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(cr.volume)}</td>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(cr.weight)}</td>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(cr.paidWeight)}</td>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem' }}>{stripOoo(cr.partyName) || '—'}</td>
                                                                                                                            <td style={{ padding: '0.3rem 0.25rem', whiteSpace: 'nowrap' }}>{(() => {
                                                                                                                                const planDate = cr.cargo && cr.cargo !== '—'
                                                                                                                                    ? (cargoPlanDateByNumber.get(normCargoKey(cr.cargo)) ?? cargoPlanDateByNumber.get(cr.cargo) ?? plannedArrivalDate)
                                                                                                                                    : plannedArrivalDate;
                                                                                                                                return planDate ? <DateText value={planDate.toISOString()} /> : 'нет';
                                                                                                                            })()}</td>
                                                                                                                        </tr>
                                                                                                                    ))}
                                                                                                                </tbody>
                                                                                                            </table>
                                                                                                        </div>
                                                                                                    </td>
                                                                                                </tr>
                                                                                            )}
                                                                                        </React.Fragment>
                                                                                    );
                                                                                })}
                                                                                <tr>
                                                                                    {canEditPlanDate && <td style={stickyTotalsCellBase} />}
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right' }} colSpan={2}>Итого</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{totals.count}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(totals.volume)}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(totals.weight)}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatNum(totals.paidWeight)}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, textAlign: 'right', whiteSpace: 'nowrap', color: densityColor(totals.weight, totals.volume) }}>{densityOf(totals.weight, totals.volume)}</td>
                                                                                    <td style={{ ...stickyTotalsCellBase, whiteSpace: 'nowrap' }}>{plannedArrivalDate ? <DateText value={plannedArrivalDate.toISOString()} /> : 'нет'}</td>
                                                                                </tr>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </tbody>
                                                            </table>
                                                            <Typography.Label
                                                                style={{
                                                                    display: 'block',
                                                                    marginTop: '0.5rem',
                                                                    fontSize: '0.75rem',
                                                                    color: 'var(--color-text-secondary)',
                                                                }}
                                                            >
                                                                Плотность (идеал 200):{' '}
                                                                <span style={{ color: '#16a34a', fontWeight: 600 }}>зелёный 180-220</span>,{' '}
                                                                <span style={{ color: '#ca8a04', fontWeight: 600 }}>жёлтый 150-179 / 221-260</span>,{' '}
                                                                <span style={{ color: '#dc2626', fontWeight: 600 }}>красный &lt;150 / &gt;260</span>
                                                            </Typography.Label>
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
                ) : (
                <motion.div key="docs-send-cards" className="documents-cards-offset-desktop" {...(docsMotionEnabled ? cargoModeSwitchMotion : { initial: false })}>
                    <div className="cargo-list">
                        {(canEditPlanDate || canRunSanctionsCheck) && (
                            <SendingsBulkActionsBar
                                selectedCount={selectedVisibleSendingCount}
                                canEditEor={canEditEor}
                                canEditPlanDate={canEditPlanDate}
                                canRunSanctionsCheck={canRunSanctionsCheck}
                                actionLoading={bulkSendingActionLoading}
                                eorMenuOpen={bulkEorMenuOpen}
                                setEorMenuOpen={setBulkEorMenuOpen}
                                planDateOpen={bulkPlanDateOpen}
                                setPlanDateOpen={setBulkPlanDateOpen}
                                planDateValue={bulkPlanDateValue}
                                setPlanDateValue={setBulkPlanDateValue}
                                actionError={bulkSendingActionError}
                                actionInfo={bulkSendingActionInfo}
                                onApplyEorStatus={applyBulkEorStatus}
                                onApplyPlanDate={applyBulkPlanDate}
                                onApplySanctionsCheck={applyBulkSanctionsCheck}
                            />
                        )}
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
                            const sendingStatusKey = getSendingStatusKey(row);
                            const sendingStatusLabel = sendingStatusKey === 'all' ? '' : STATUS_MAP[sendingStatusKey];
                            const transitHours = getSendingTransitHours(row);
                            const transitDays = transitHours == null ? null : Math.round((transitHours / 24) * 10) / 10;
                            const isFinalTransit = getSendingTransitIsFinal(row);
                            const plannedArrivalDate = getSendingPlannedArrivalDate(row);
                            const routeFrom = String(row?.ПунктОтправленияГородАэропорт ?? row?.CitySender ?? row?.ГородОтправления ?? '').trim();
                            const routeTo = String(row?.ПунктНазначенияГородАэропорт ?? row?.CityReceiver ?? row?.ГородНазначения ?? '').trim();
                            const route = [cityToCode(routeFrom), cityToCode(routeTo)].filter(Boolean).join(' – ') || [routeFrom, routeTo].filter(Boolean).join(' – ') || '—';
                            const expanded = expandedSendingRow === rowKey;
                            const rowSanctionResult = sendingSanctionMap[rowKey];
                            return (
                                <Panel
                                    key={rowKey}
                                    className="cargo-card"
                                    onClick={() => setExpandedSendingRow((prev) => (prev === rowKey ? null : rowKey))}
                                    style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative', paddingBottom: canSelectSendingRows ? '1.5rem' : undefined }}
                                    title={expanded ? 'Свернуть отправку' : 'Показать детали отправки'}
                                >
                                    {canSelectSendingRows && (
                                        <div style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 2 }} onClick={(e) => e.stopPropagation()}>
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
                                        </div>
                                    )}
                                    <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem', minWidth: 0, overflow: 'visible' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
                                            {number ? formatInvoiceNumber(number) : '—'}
                                        </Typography.Body>
                                        <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem', flexShrink: 0 }}>
                                            <DateText value={rawDate ? String(rawDate) : undefined} />
                                        </Typography.Label>
                                    </Flex>
                                    <Flex justify="space-between" align="center" style={{ marginBottom: '0.45rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <DocumentsRouteBadge>
                                            {route}
                                        </DocumentsRouteBadge>
                                        <Flex align="center" gap="0.35rem">
                                            {(transportType === 'ferry' || transportType === 'auto') ? (
                                                <CargoTransportTypeIcon ak={transportType === 'ferry'} />
                                            ) : null}
                                            {sendingStatusLabel ? <StatusBadge status={sendingStatusLabel} /> : <Typography.Label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>—</Typography.Label>}
                                        </Flex>
                                    </Flex>
                                    <Flex justify="space-between" align="center" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>
                                        <Typography.Label>
                                            В пути:{' '}
                                            {transitHours == null ? '—' : (
                                                <span style={isFinalTransit ? { color: '#16a34a', fontWeight: 600 } : undefined}>
                                                    {Number.isInteger(transitHours) ? transitHours : transitHours.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ч
                                                    {' / '}
                                                    {(transitDays != null && Number.isInteger(transitDays) ? transitDays : (transitDays ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} д
                                                </span>
                                            )}
                                        </Typography.Label>
                                        <Typography.Label>
                                            План: {plannedArrivalDate ? <DateText value={plannedArrivalDate.toISOString()} /> : 'нет'}
                                        </Typography.Label>
                                    </Flex>
                                    {hasAnalytics && (
                                        <div style={{ marginBottom: '0.35rem' }}>
                                            {renderSanctionBadge(rowSanctionResult)}
                                        </div>
                                    )}
                                    <Typography.Label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={vehicle || '—'}>
                                        ТС: {vehicle || '—'}
                                    </Typography.Label>
                                    {comment && (
                                        <Typography.Label style={{ marginTop: '0.2rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comment}>
                                            Комментарий: {comment}
                                        </Typography.Label>
                                    )}
                                    {expanded && (
                                        <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.55rem' }} onClick={(ev) => ev.stopPropagation()}>
                                            <Typography.Label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem', display: 'block' }}>
                                                Посылок: {parcelsToRender.length}
                                            </Typography.Label>
                                            {parcelsToRender.length === 0 ? (
                                                <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.35rem 0.2rem', fontSize: '0.8rem' }}>
                                                    Нет данных по посылкам
                                                </Typography.Body>
                                            ) : (
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table className="doc-inner-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Посылка</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Перевозка</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Номенклатура</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>ТН ВЭД</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Санкции</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Кол-во</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {parcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                                const goodsRaw = parcel?.Товары;
                                                                const goods = Array.isArray(goodsRaw) ? goodsRaw[0] : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : {});
                                                                const parcelNomenclature = pickNomenclatureText(parcel) || String(goods?.ТМЦ ?? '');
                                                                const parcelSanctionResult = getParcelSanctionResult(parcel);
                                                                return (
                                                                    <tr
                                                                        key={`${rowKey}-card-parcel-${parcel?.Посылка ?? parcelIdx}`}
                                                                        style={{
                                                                            borderBottom: '1px solid var(--color-border)',
                                                                            background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                        }}
                                                                    >
                                                                        <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? parcel?.Посылка ?? '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}><ClickableCargoNumber number={parcel?.Перевозка} onOpen={onOpenCargo} /></td>
                                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{parcelNomenclature || '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{getParcelTnvedCode(parcel) || '—'}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{renderSanctionBadge(rowSanctionResult ? parcelSanctionResult : null)}</td>
                                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
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
                            );
                        })}
                    </div>
                </motion.div>
                )}
                </AnimatePresence>
  );
}
