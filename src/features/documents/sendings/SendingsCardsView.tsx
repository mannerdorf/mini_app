import React from "react";
import { motion } from "motion/react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { CargoTransportTypeIcon } from "../../../components/shared/CargoTableDisplay";
import { StatusBadge } from "../../../components/shared/StatusBadges";
import { TapSwitch } from "../../../components/TapSwitch";
import { formatCurrency, stripOoo, formatInvoiceNumber, cityToCode } from "../../../lib/formatUtils";
import { STATUS_MAP, normalizeStatus } from "../../../lib/statusUtils";
import {
  formatSendingMetricNum,
  getParcelDeclaredCost,
  getParcelFreightSum,
  getSendingRowParcelMetrics,
  parseSendingMetricNumber,
} from "./sendingsMetrics";
import { normCargoKey } from "../lib/documentsPipeline";
import { pickNomenclatureText } from "../../../lib/sanctions";
import {
  getRequestParcels,
  getParcelTnvedCode,
  getParcelSearchText,
} from "./sendingsParcelHelpers";
import { getSendingRowTransportMode } from "./sendingsTransportHelpers";
import {
  getSendingRowKey,
} from "./sendingsRowHelpers";
import { DocumentsRouteBadge } from "../views/documentsViewBlocks";
import { SendingsBulkActionsBar } from "./SendingsBulkActionsBar";
import type { SendingsSectionViewProps } from "./sendingsSectionProps";

export function SendingsCardsView(props: SendingsSectionViewProps) {
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
  return (
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
                                                <div className="doc-inner-table-wrap mobile-card-table-wrap">
                                                    <table className="doc-inner-table mobile-card-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Посылка</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Перевозка</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Номенклатура</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>ТН ВЭД</th>
                                                                <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600 }}>Кол-во</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {parcelsToRender.map((parcel: any, parcelIdx: number) => {
                                                                const goodsRaw = parcel?.Товары;
                                                                const goods = Array.isArray(goodsRaw) ? goodsRaw[0] : (goodsRaw && typeof goodsRaw === 'object' ? goodsRaw : {});
                                                                const parcelNomenclature = pickNomenclatureText(parcel) || String(goods?.ТМЦ ?? '');
                                                                return (
                                                                    <tr
                                                                        key={`${rowKey}-card-parcel-${parcel?.Посылка ?? parcelIdx}`}
                                                                        className="mobile-card-table__row"
                                                                        style={{
                                                                            borderBottom: '1px solid var(--color-border)',
                                                                            background: hasParcelSearchMatches ? 'rgba(37, 99, 235, 0.08)' : undefined,
                                                                        }}
                                                                    >
                                                                        <td data-label="Посылка" style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{parcel?.ПосылкаНаименование ?? parcel?.Посылка ?? '—'}</td>
                                                                        <td data-label="Перевозка" style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}><ClickableCargoNumber number={parcel?.Перевозка} onOpen={(n) => handleOpenCargo(n, {
                                                                            Customer: parcel?.ЗаказчикНаименование ?? parcel?.Заказчик,
                                                                            State: cargoStateByNumber.get(normCargoKey(String(parcel?.Перевозка ?? ''))),
                                                                            PW: parcel?.ПлатныйВес,
                                                                            W: parcel?.ВесДляОтчета,
                                                                            Value: parcel?.ОбъемДляОтчета,
                                                                            Mest: goods?.Количество,
                                                                            Sum: getParcelFreightSum(parcel, cargoSumByNumber) || undefined,
                                                                        })} /></td>
                                                                        <td data-label="Номенклатура" style={{ padding: '0.35rem 0.3rem' }}>{parcelNomenclature || '—'}</td>
                                                                        <td data-label="ТН ВЭД" style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{getParcelTnvedCode(parcel) || '—'}</td>
                                                                        <td data-label="Кол-во" style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
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
  );
}
