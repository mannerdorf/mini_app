import React from "react";
import { ClickableCargoNumber } from "../../../components/ui/EntityLinks";
import { formatCurrency } from "../../../lib/formatUtils";
import { pickNomenclatureText } from "../../../lib/sanctions";
import { getParcelTnvedCode } from "./sendingsParcelHelpers";
import {
  formatSendingMetricNum,
  getParcelDeclaredCost,
  getParcelFreightSum,
  parseSendingMetricNumber,
} from "./sendingsMetrics";
import { normCargoKey } from "../lib/documentsPipeline";
import type { SendingsTableExpandedRowProps } from "./sendingsTableExpandedProps";

type Props = Pick<
  SendingsTableExpandedRowProps,
  | "rowKey"
  | "parcelsToRender"
  | "hasParcelSearchMatches"
  | "cargoSumByNumber"
  | "cargoStateByNumber"
  | "handleOpenCargo"
>;

export function SendingsTableExpandedGeneralView(props: Props) {
  const { rowKey, parcelsToRender, hasParcelSearchMatches, cargoSumByNumber, cargoStateByNumber, handleOpenCargo } = props;
  return (
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
                            <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}><ClickableCargoNumber number={parcel?.Перевозка} onOpen={(n) => handleOpenCargo(n, {
                                Customer: parcel?.ЗаказчикНаименование ?? parcel?.Заказчик,
                                State: cargoStateByNumber.get(normCargoKey(String(parcel?.Перевозка ?? ''))),
                                PW: parcel?.ПлатныйВес,
                                W: parcel?.ВесДляОтчета,
                                Value: parcel?.ОбъемДляОтчета,
                                Mest: goods?.Количество,
                                Sum: getParcelFreightSum(parcel, cargoSumByNumber) || undefined,
                            })} /></td>
                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ВесДляОтчета ?? '—'}</td>
                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{parcel?.ОбъемДляОтчета ?? '—'}</td>
                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{(() => { const w = parseSendingMetricNumber(parcel?.ПлатныйВес); return w > 0 ? formatSendingMetricNum(w) : '—'; })()}</td>
                            <td style={{ padding: '0.35rem 0.3rem' }}>{parcelNomenclature || '—'}</td>
                            <td style={{ padding: '0.35rem 0.3rem', whiteSpace: 'nowrap' }}>{getParcelTnvedCode(parcel) || '—'}</td>
                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{goods?.Количество ?? '—'}</td>
                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{(() => { const sum = getParcelFreightSum(parcel, cargoSumByNumber); return sum > 0 ? formatCurrency(sum, true) : '—'; })()}</td>
                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{(() => { const sum = getParcelDeclaredCost(parcel); return sum > 0 ? formatCurrency(sum, true) : '—'; })()}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
  );
}
