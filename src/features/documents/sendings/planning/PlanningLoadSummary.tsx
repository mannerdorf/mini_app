import React from 'react';
import { type TmsCargo, type Vehicle } from '../../../tms/model';
import {planningVehicle,type PlanDraft} from './planningModel';
import { planningNumber } from './PlanningCargoTable';

export function planningLoadTotals(cargo: TmsCargo[]) {
  const totals = { weight: 0, volume: 0, places: 0, paidWeight: 0 };
  const missing = { weight: 0, volume: 0, places: 0, paidWeight: 0 };
  for (const item of cargo) for (const field of ['weight', 'volume', 'places', 'paidWeight'] as const) {
    const value = item[field];
    if (value == null) missing[field]++; else totals[field] += value;
  }
  return { totals, missing, count: cargo.length };
}

function Capacity({ label, value, limit, unit, digits = 1, missing }: {
  label: string; value: number; limit?: number; unit: string; digits?: number; missing: number;
}) {
  const percent = limit ? value / limit * 100 : null;
  const overloaded = percent !== null && percent > 100;
  return <div className={`sending-planning__capacity${overloaded ? ' is-overloaded' : ''}`}>
    <div><span>{label}</span><b>{percent === null ? 'Лимит не задан' : `${planningNumber(percent, 0)}%`}</b></div>
    <span className="sending-planning__capacity-track" role={percent === null ? undefined : 'progressbar'}
      aria-label={`Заполнение ТС по ${label === 'Вес' ? 'весу' : 'объёму'}`} aria-valuemin={percent === null ? undefined : 0}
      aria-valuemax={percent === null ? undefined : 100} aria-valuenow={percent === null ? undefined : Math.min(100, percent)}
      aria-valuetext={percent === null ? undefined : `${planningNumber(percent)}%${overloaded ? ', перегруз' : ''}`}>
      <i style={{ width: `${percent === null ? 0 : Math.min(100, percent)}%` }} />
    </span>
    <small>{planningNumber(value, digits)}{limit ? ` / ${planningNumber(limit, digits)}` : ''} {unit}{overloaded && <b> · Перегруз</b>}{missing > 0 ? ` · нет данных: ${missing}` : ''}</small>
  </div>;
}

export function PlanningLoadSummary({ cargo, draft }: { cargo: TmsCargo[]; draft: PlanDraft }) {
  const vehicle: Vehicle | undefined = planningVehicle(draft);
  const summary = planningLoadTotals(cargo);
  const total = (field: keyof typeof summary.totals) => summary.totals[field];
  const missing = (field: keyof typeof summary.missing) => summary.missing[field];
  const paidMissing = missing('paidWeight');
  return <section className="sending-planning__load-summary sending-planning__form-section" aria-label="Итоги выбранных перевозок">
    <div className="sending-planning__load-heading"><h4 className="sending-planning__section-heading"><span>2</span>Заполнение ТС и итоги</h4>{vehicle && <small>{vehicle.name}</small>}</div>
    <div className="sending-planning__capacities">
      <Capacity label="Вес" value={total('weight')} limit={vehicle?.payload} unit="кг" missing={missing('weight')} />
      <Capacity label="Объём" value={total('volume')} limit={vehicle?.volume} unit="м³" digits={2} missing={missing('volume')} />
    </div>
    <dl className="sending-planning__selection-totals">
      <div><dt>Вес</dt><dd>{planningNumber(total('weight'))} кг</dd></div>
      <div><dt>Объём</dt><dd>{planningNumber(total('volume'), 2)} м³</dd></div>
      <div><dt>Количество</dt><dd>{cargo.length} перев. · {planningNumber(total('places'), 0)} мест</dd></div>
      <div><dt>Платный вес</dt><dd>{cargo.length > 0 && paidMissing === cargo.length ? '—' : `${planningNumber(total('paidWeight'))} кг`}</dd>
        {paidMissing > 0 && <small>Нет данных: {paidMissing} перев.</small>}</div>
    </dl>
  </section>;
}
