import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import type { TmsCargo, Vehicle } from '../../../tms/model';
import { planningNumber } from './PlanningCargoTable';
import { groupPickerHierarchy, PICKER_VIEWS, receiptDateLabel, type PlanningPickerView, type PlanningPickerGroup } from './planningPickerModel';
import type { RecommendationMode, RecommendationRequest, RecommendationResult } from './planningRecommendations';

type Selection = {
  selected: Set<string>;
  locked: Set<string>;
  recommended: Set<string>;
  onSelect: (numbers: string[], include: boolean) => void;
};

function Candidate({ cargo, selected, locked, recommended, onSelect }: Selection & { cargo: TmsCargo }) {
  return <label className={`sending-planning__candidate${recommended.has(cargo.number) ? ' is-recommended' : ''}`}>
    <input type="checkbox" aria-label={`Добавить перевозку ${cargo.number}`} checked={selected.has(cargo.number)}
      disabled={locked.has(cargo.number)} onChange={event => onSelect([cargo.number], event.target.checked)} />
    <span><b>{cargo.number}</b><span>{cargo.customer}</span><small>{cargo.receiver}</small>
      {cargo.sender && <small>Отправитель: {cargo.sender}</small>}
      {cargo.received && <small>Поступление: {receiptDateLabel(cargo.received)}</small>}
      {cargo.readiness === 'unreceived' && <small>Поступление на склад пока не подтверждено</small>}
      {recommended.has(cargo.number) && <small className="sending-planning__recommendation-label">Рекомендуется добавить</small>}
    </span>
    <span className="sending-planning__candidate-metrics">{cargo.weight === null ? '—' : planningNumber(cargo.weight)} кг
      <small>{cargo.volume === null ? '—' : planningNumber(cargo.volume, 2)} м³</small>
    </span>
  </label>;
}

function CandidateGroup({ group, selected, locked, recommended, onSelect, nested = false }: Selection & { group: PlanningPickerGroup; nested?: boolean }) {
  const [limit, setLimit] = useState(100);
  const checkbox = useRef<HTMLInputElement>(null);
  useEffect(() => setLimit(100), [group.cargo]);
  const editable = group.cargo.filter(cargo => !locked.has(cargo.number));
  const included = group.cargo.filter(cargo => selected.has(cargo.number)).length;
  const suggested = group.cargo.filter(cargo => recommended.has(cargo.number)).length;
  useEffect(() => {
    if (checkbox.current) checkbox.current.indeterminate = included > 0 && included < group.cargo.length;
  }, [included, group.cargo.length]);
  const allIncluded = editable.length > 0 && editable.every(cargo => selected.has(cargo.number));
  const hasMore = limit < (group.children?.length ?? group.cargo.length);
  return <details className={`sending-planning__picker-group${nested ? ' sending-planning__picker-group--nested' : ''}${suggested ? ' is-recommended' : ''}`}>
    <summary><input ref={checkbox} type="checkbox" className="sending-planning__group-checkbox"
      aria-label={`Выбрать группу ${group.label}`} checked={included === group.cargo.length} disabled={!editable.length}
      onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onChange={event => onSelect(editable.map(cargo => cargo.number), event.target.checked)} />
      <span><b>{group.label}</b><small>{group.cargo.length} перев. · {planningNumber(group.weight)} кг · {planningNumber(group.volume, 2)} м³</small>
      {included > 0 && <small>Выбрано: {included} из {group.cargo.length}</small>}
      {suggested > 0 && <small className="sending-planning__recommendation-label">Рекомендуется: {suggested} из {group.cargo.length}</small>}</span><ChevronDown size={16} /></summary>
    <div className="sending-planning__picker-group-actions">
      <button type="button" className="filter-button" disabled={!editable.length}
        onClick={() => onSelect(editable.map(cargo => cargo.number), !allIncluded)}>{allIncluded ? 'Убрать группу' : 'Добавить группу'}</button>
    </div>
    {group.children ? <div className="sending-planning__picker-children">
      {group.children.slice(0, limit).map(child => <CandidateGroup key={child.key} group={child} selected={selected} locked={locked} recommended={recommended} onSelect={onSelect} nested />)}
    </div> : group.cargo.slice(0, limit).map(cargo => <Candidate key={cargo.number} cargo={cargo} selected={selected} locked={locked} recommended={recommended} onSelect={onSelect} />)}
    {hasMore && <button type="button" className="filter-button" onClick={() => setLimit(value => value + 100)}>{group.children ? 'Показать ещё группы' : 'Показать ещё перевозки'}</button>}
  </details>;
}

export function PlanningCargoPicker({ candidates, selectedCargo, vehicle, cargoNumbers, locked, onSelect }: {
  candidates: TmsCargo[]; selectedCargo: TmsCargo[]; vehicle?: Vehicle; cargoNumbers: string[]; locked: Set<string>; onSelect: Selection['onSelect'];
}) {
  const [view, setView] = useState<PlanningPickerView>('cargo');
  const [limit, setLimit] = useState(100);
  const [mode, setMode] = useState<RecommendationMode | null>(null);
  const [recommendation, setRecommendation] = useState<{ request: RecommendationRequest; result?: RecommendationResult; error?: string } | null>(null);
  const request = useMemo<RecommendationRequest | null>(() => mode ? { mode, candidates, selected: selectedCargo, locked: [...locked], vehicle } : null,
    [mode, candidates, selectedCargo, vehicle, [...locked].join(',')]);
  useEffect(() => {
    if (!request) { setRecommendation(null); return; }
    const worker = new Worker(new URL('./planningRecommendations.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => setRecommendation({ request, ...event.data });
    worker.onerror = () => setRecommendation({ request, error: 'Не удалось подобрать перевозки. Повторите выбор режима.' });
    worker.postMessage(request);
    return () => worker.terminate();
  }, [request]);
  const current = recommendation?.request === request ? recommendation : null;
  const recommended = useMemo(() => new Set(current?.result?.numbers || []), [current]);
  useEffect(() => setLimit(100), [candidates, view]);
  const selected = useMemo(() => new Set(cargoNumbers), [cargoNumbers]);
  const groups = useMemo(() => view === 'cargo' ? [] : groupPickerHierarchy(candidates, view), [candidates, view]);
  const hasMore = limit < (view === 'cargo' ? candidates.length : groups.length);
  return <section className="sending-planning__picker" aria-label="Неотправленные перевозки">
    <div className="sending-planning__recommendation-modes" role="group" aria-label="Режим подбора перевозок">
      <span>Подбор</span>
      <button type="button" className="filter-button" aria-pressed={mode === 'fifo'} onClick={() => setMode(value => value === 'fifo' ? null : 'fifo')} title="Сначала ранние поступления, с учётом свободного веса и объёма ТС">FIFO</button>
      <button type="button" className="filter-button sending-planning__paid-mode" aria-label="Подбор по платному весу" aria-pressed={mode === 'paid'} onClick={() => setMode(value => value === 'paid' ? null : 'paid')} title="Максимальный суммарный платный вес в пределах веса и объёма ТС"><Scale size={18}/></button>
    </div>
    {request && <div className="sending-planning__recommendation-summary" role="status">
      {!current ? 'Подбираем перевозки…' : current.error || current.result?.message || <>
        <b>{mode === 'fifo' ? 'FIFO · сначала ранние' : current.result?.optimal ? 'Максимальный платный вес' : 'Платный вес · лучший найденный вариант'}</b>
        <span>Подсвечено: {recommended.size} перев. · +{planningNumber(current.result!.weight)} кг · +{planningNumber(current.result!.volume, 2)} м³ · платный вес +{planningNumber(current.result!.paidWeight)} кг</span>
        {!!current.result?.excluded && <span>Не хватает данных для подбора: {current.result.excluded} перев.</span>}
        {!!current.result?.missingPaid && <span>Платный вес не заполнен: {current.result.missingPaid} перев.</span>}
      </>}
    </div>}
    <div className="sending-planning__tabs sending-planning__picker-views" role="group" aria-label="Просмотр доступных перевозок">
      {PICKER_VIEWS.map(item => <button type="button" key={item.value} aria-pressed={view === item.value} onClick={() => setView(item.value)}>{item.label}</button>)}
    </div>
    <p className="sending-planning__muted">Доступные перевозки по маршруту: {candidates.length}</p>
    {view === 'date' && <p className="sending-planning__muted">По дате поступления на склад</p>}
    <div className="sending-planning__picker-list">
      {view === 'cargo' ? candidates.slice(0, limit).map(cargo => <Candidate key={cargo.number} cargo={cargo} selected={selected} locked={locked} recommended={recommended} onSelect={onSelect} />)
        : groups.slice(0, limit).map(group => <CandidateGroup key={`${view}:${group.key}`} group={group} selected={selected} locked={locked} recommended={recommended} onSelect={onSelect} />)}
      {!candidates.length && <p className="sending-planning__muted">Нет перевозок по выбранным условиям</p>}
      {hasMore && <button type="button" className="filter-button" onClick={() => setLimit(value => value + 100)}>{view === 'cargo' ? 'Показать ещё' : 'Показать ещё группы'}</button>}
    </div>
  </section>;
}
