import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Scale, CheckSquare, Info, Sparkles } from 'lucide-react';
import type { TmsCargo, Vehicle } from '../../../tms/model';
import { planningNumber } from './PlanningCargoTable';
import { groupPickerHierarchy, receiptDateLabel, type PlanningPickerView, type PlanningPickerGroup } from './planningPickerModel';
import {PlanningCargoViews} from './PlanningCargoViews';
import { recommendationPaidRanks, type RecommendationMode, type RecommendationContext, type RecommendationComparison, type RecommendationReason } from './planningRecommendations';

type Selection = {
  selected: Set<string>;
  locked: Set<string>;
  recommended: Set<string>;
  reasons?: Record<string, RecommendationReason>;
  onSelect: (numbers: string[], include: boolean) => void;
};

function Candidate({ cargo, selected, locked, recommended, reasons, onSelect }: Selection & { cargo: TmsCargo }) {
  const reason = reasons?.[cargo.number];
  return <label className={`sending-planning__candidate${recommended.has(cargo.number) ? ' is-recommended' : ''}`}>
    <input type="checkbox" aria-label={`Добавить перевозку ${cargo.number}`} checked={selected.has(cargo.number)}
      disabled={locked.has(cargo.number)} onChange={event => onSelect([cargo.number], event.target.checked)} />
    <span><span className="sending-planning__candidate-number"><b>{cargo.number}</b>{reason && <span className="sending-planning__recommendation-reason" role="img" tabIndex={0}
      aria-label={`Причина подбора перевозки ${cargo.number}: ${reason.text}`} title={reason.text}
      onClick={event => { event.preventDefault(); event.stopPropagation(); }}><Info size={16} aria-hidden="true"/></span>}</span><span>{cargo.customer}</span><small>{cargo.receiver}</small>
      {cargo.sender && <small>Отправитель: {cargo.sender}</small>}
      {cargo.slaDeadline && <small>Срок по SLA: {receiptDateLabel(cargo.slaDeadline.slice(0,10))}{cargo.slaPlanDays?` · ${cargo.slaPlanDays} дн.`:''}</small>}
      {cargo.plannedDeliveryDate && <small>Плановая дата доставки: {receiptDateLabel(cargo.plannedDeliveryDate)}</small>}
      {cargo.received && <small>Поступление: {receiptDateLabel(cargo.received)}</small>}
      {cargo.readiness === 'unreceived' && <small>Поступление на склад пока не подтверждено</small>}
      {recommended.has(cargo.number) && <small className="sending-planning__recommendation-label">Рекомендуется добавить</small>}
    </span>
    <span className="sending-planning__candidate-metrics">{cargo.weight === null ? '—' : planningNumber(cargo.weight)} кг
      <small>{cargo.volume === null ? '—' : planningNumber(cargo.volume, 2)} м³</small>
    </span>
  </label>;
}

function CandidateGroup({ group, selected, locked, recommended, reasons, onSelect, nested = false }: Selection & { group: PlanningPickerGroup; nested?: boolean }) {
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
      <span><b>{group.label}</b><span className="sending-planning__group-metrics"><small title={`${group.cargo.length} перев. · ${planningNumber(group.weight)} кг · ${planningNumber(group.volume, 2)} м³`}>{group.cargo.length} перев. · {planningNumber(group.weight)} кг · {planningNumber(group.volume, 2)} м³</small>
      {suggested > 0 && <span className="sending-planning__recommendation-count" role="img" tabIndex={0} aria-label={`Рекомендуется: ${suggested} из ${group.cargo.length} перевозок`} title={`Рекомендуется: ${suggested} из ${group.cargo.length} перевозок`}><Sparkles size={14} aria-hidden="true"/>{suggested} из {group.cargo.length}</span>}</span>
      {included > 0 && <small>Выбрано: {included} из {group.cargo.length}</small>}
      </span><ChevronDown size={16} /></summary>
    <div className="sending-planning__picker-group-actions">
      <button type="button" className="filter-button" disabled={!editable.length}
        onClick={() => onSelect(editable.map(cargo => cargo.number), !allIncluded)}>{allIncluded ? 'Убрать группу' : 'Добавить группу'}</button>
    </div>
    {group.children ? <div className="sending-planning__picker-children">
      {group.children.slice(0, limit).map(child => <CandidateGroup key={child.key} group={child} selected={selected} locked={locked} recommended={recommended} reasons={reasons} onSelect={onSelect} nested />)}
    </div> : group.cargo.slice(0, limit).map(cargo => <Candidate key={cargo.number} cargo={cargo} selected={selected} locked={locked} recommended={recommended} reasons={reasons} onSelect={onSelect} />)}
    {hasMore && <button type="button" className="filter-button" onClick={() => setLimit(value => value + 100)}>{group.children ? 'Показать ещё группы' : 'Показать ещё перевозки'}</button>}
  </details>;
}

export function PlanningCargoPicker({ candidates, selectedCargo, vehicle, cargoNumbers, locked, initialSlaCutoff, onSelect }: {
  candidates: TmsCargo[]; selectedCargo: TmsCargo[]; vehicle?: Vehicle; cargoNumbers: string[]; locked: Set<string>; initialSlaCutoff: string; onSelect: Selection['onSelect'];
}) {
  const [view, setView] = useState<PlanningPickerView>('customer');
  const [limit, setLimit] = useState(100);
  const [mode, setMode] = useState<RecommendationMode | null>(null);
  const [cutoffOverride, setCutoffOverride] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const slaCutoff = cutoffOverride ?? initialSlaCutoff;
  const [recommendation, setRecommendation] = useState<{ request: RecommendationContext; results?: RecommendationComparison; error?: string } | null>(null);
  const request = useMemo<RecommendationContext>(() => ({ candidates, selected: selectedCargo, locked: [...locked], vehicle, slaCutoff }),
    [candidates, selectedCargo, vehicle, [...locked].join(','), slaCutoff]);
  useEffect(() => {
    setRecommendation(null);
    const worker = new Worker(new URL('./planningRecommendations.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => setRecommendation({ request, ...event.data });
    worker.onerror = () => setRecommendation({ request, error: 'Не удалось подобрать перевозки. Повторите выбор режима.' });
    worker.postMessage(request);
    return () => worker.terminate();
  }, [request, retry]);
  const current = recommendation?.request === request ? recommendation : null;
  const result = mode ? current?.results?.[mode] : undefined;
  const recommended = useMemo(() => new Set(result?.numbers || []), [result]);
  const ranks = useMemo(() => current?.results ? recommendationPaidRanks(current.results) : {}, [current]);
  const modeClass = (value: RecommendationMode) => `filter-button${ranks[value] ? ` sending-planning__paid-rank--${ranks[value]}` : ''}`;
  const chooseMode = (value: RecommendationMode) => {
    setMode(previous => previous === value && !current?.error ? null : value);
    if (current?.error) setRetry(previous => previous + 1);
  };
  const modeTitle = (value: RecommendationMode, description: string) => {
    const variant = current?.results?.[value];
    if (!variant || variant.message) return description;
    if (variant.missingPaid) return `${description}. Платный вес известен не у всех рекомендованных перевозок; сравнить его нельзя.`;
    return `${description}. Добавляемый платный вес: ${planningNumber(variant.paidWeight)} кг.${ranks[value] === 'max' ? ' Зелёная полоска: наибольший среди найденных вариантов.' : ranks[value] === 'min' ? ' Красная полоска: наименьший среди найденных вариантов.' : ''}`;
  };
  useEffect(() => setLimit(100), [candidates, view]);
  const selected = useMemo(() => new Set(cargoNumbers), [cargoNumbers]);
  const groups = useMemo(() => view === 'cargo' ? [] : groupPickerHierarchy(candidates, view), [candidates, view]);
  const hasMore = limit < (view === 'cargo' ? candidates.length : groups.length);
  return <section className="sending-planning__picker" aria-label="Неотправленные перевозки">
    <div className="sending-planning__recommendation-modes" role="group" aria-label="Режим подбора перевозок">
      <span>Подбор</span>
      <div className="sending-planning__recommendation-controls">
        <button type="button" className={modeClass('fifo')} aria-pressed={mode === 'fifo'} onClick={() => chooseMode('fifo')} title={modeTitle('fifo','Сначала ранние поступления, с учётом свободного веса и объёма ТС')}>FIFO</button>
        <button type="button" className={`${modeClass('paid')} sending-planning__paid-mode`} aria-label="Подбор по платному весу" aria-pressed={mode === 'paid'} onClick={() => chooseMode('paid')} title={modeTitle('paid','Максимальный суммарный платный вес целых групп в пределах веса и объёма ТС')}><Scale size={18}/></button>
        <button type="button" className={modeClass('delivery')} aria-pressed={mode === 'delivery'} onClick={() => chooseMode('delivery')} title={modeTitle('delivery','Сначала перевозки с ближайшим сроком по SLA, в пределах веса и объёма ТС')}>SLA</button>
        <button type="button" className={modeClass('sla-paid')} aria-label="Подбор SLA и платный вес" aria-pressed={mode === 'sla-paid'} onClick={() => chooseMode('sla-paid')} title={modeTitle('sla-paid','Сначала сроки до даты «SLA до», затем дозагрузка по платному весу')}>SLA + <Scale size={16}/></button>
        <button type="button" className="button-primary sending-planning__apply-recommendation" aria-label="Проставить чекбоксы" disabled={!recommended.size || !!current?.error || !!result?.message} onClick={() => onSelect([...recommended], true)} title="Проставить чекбоксы: добавить подсвеченные рекомендации к уже выбранным перевозкам"><CheckSquare size={18}/><span>Проставить чекбоксы</span></button>
      </div>
    </div>
    {mode === 'sla-paid' && <label className="sending-planning__sla-cutoff">SLA до<input type="date" aria-label="SLA до" value={slaCutoff} onChange={event => setCutoffOverride(event.target.value)}/><small>Сроки до этой даты включительно — первыми. Остаток ТС — по платному весу.</small></label>}
    {mode && <div className="sending-planning__recommendation-summary" role="status">
      {!current ? 'Подбираем перевозки…' : current.error || result?.message || <>
        <b>{mode === 'fifo' ? 'FIFO · сначала ранние' : mode === 'delivery' ? 'SLA · сначала ближайшие сроки' : mode === 'sla-paid' ? 'SLA + платный вес · приоритет срокам, затем дозагрузка' : result?.optimal ? 'Максимальный платный вес' : 'Платный вес · лучший найденный вариант'}</b>
        <div className="sending-planning__recommendation-metrics">
          <div className="sending-planning__recommendation-metrics-row">
            <span>{recommended.size} перев. · групп: {result!.recommendedGroups}</span>
            <span>Платный вес: {planningNumber(result!.paidWeight)} кг</span>
          </div>
          <div className="sending-planning__recommendation-metrics-row">
            <span>Вес: {planningNumber(result!.weight)} кг</span>
            <span>Объём: {planningNumber(result!.volume, 2)} м³</span>
          </div>
        </div>
        {(mode==='delivery'||mode==='sla-paid')&&!!result?.missingDelivery&&<span>Не удалось рассчитать срок по SLA: {result.missingDelivery} перев.</span>}
        {!!result?.excluded&&<span>Не хватает данных для подбора: {result.excluded} перев. Причина — у значка ⓘ рядом с номером.</span>}
        {!!result?.missingPaid && <span>Платный вес не заполнен: {result.missingPaid} перев.</span>}
        {mode==='sla-paid'&&!result?.optimal&&<span>Дозагрузка: лучший найденный вариант по платному весу.</span>}
      </>}
    </div>}
    <PlanningCargoViews view={view} onChange={setView} label="Просмотр доступных перевозок"/>
    <p className="sending-planning__muted">Доступные перевозки по маршруту: {candidates.length}</p>
    {view === 'date' && <p className="sending-planning__muted">По дате поступления на склад</p>}
    <div className="sending-planning__picker-list">
      {view === 'cargo' ? candidates.slice(0, limit).map(cargo => <Candidate key={cargo.number} cargo={cargo} selected={selected} locked={locked} recommended={recommended} reasons={result?.reasons} onSelect={onSelect} />)
        : groups.slice(0, limit).map(group => <CandidateGroup key={`${view}:${group.key}`} group={group} selected={selected} locked={locked} recommended={recommended} reasons={result?.reasons} onSelect={onSelect} />)}
      {!candidates.length && <p className="sending-planning__muted">Нет перевозок по выбранным условиям</p>}
      {hasMore && <button type="button" className="filter-button" onClick={() => setLimit(value => value + 100)}>{view === 'cargo' ? 'Показать ещё' : 'Показать ещё группы'}</button>}
    </div>
  </section>;
}
