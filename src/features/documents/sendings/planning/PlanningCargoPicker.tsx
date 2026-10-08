import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TmsCargo } from '../../../tms/model';
import { planningNumber } from './PlanningCargoTable';
import { groupPickerHierarchy, PICKER_VIEWS, receiptDateLabel, type PlanningPickerView, type PlanningPickerGroup } from './planningPickerModel';

type Selection = {
  selected: Set<string>;
  locked: Set<string>;
  onSelect: (numbers: string[], include: boolean) => void;
};

function Candidate({ cargo, selected, locked, onSelect }: Selection & { cargo: TmsCargo }) {
  return <label className="sending-planning__candidate">
    <input type="checkbox" aria-label={`Добавить перевозку ${cargo.number}`} checked={selected.has(cargo.number)}
      disabled={locked.has(cargo.number)} onChange={event => onSelect([cargo.number], event.target.checked)} />
    <span><b>{cargo.number}</b><span>{cargo.customer}</span><small>{cargo.receiver}</small>
      {cargo.sender && <small>Отправитель: {cargo.sender}</small>}
      {cargo.received && <small>Поступление: {receiptDateLabel(cargo.received)}</small>}
      {cargo.readiness === 'unreceived' && <small>Поступление на склад пока не подтверждено</small>}
    </span>
    <span className="sending-planning__candidate-metrics">{cargo.weight === null ? '—' : planningNumber(cargo.weight)} кг
      <small>{cargo.volume === null ? '—' : planningNumber(cargo.volume, 2)} м³</small>
    </span>
  </label>;
}

function CandidateGroup({ group, selected, locked, onSelect, nested = false }: Selection & { group: PlanningPickerGroup; nested?: boolean }) {
  const [limit, setLimit] = useState(100);
  const checkbox = useRef<HTMLInputElement>(null);
  useEffect(() => setLimit(100), [group.cargo]);
  const editable = group.cargo.filter(cargo => !locked.has(cargo.number));
  const included = group.cargo.filter(cargo => selected.has(cargo.number)).length;
  useEffect(() => {
    if (checkbox.current) checkbox.current.indeterminate = included > 0 && included < group.cargo.length;
  }, [included, group.cargo.length]);
  const allIncluded = editable.length > 0 && editable.every(cargo => selected.has(cargo.number));
  const hasMore = limit < (group.children?.length ?? group.cargo.length);
  return <details className={`sending-planning__picker-group${nested ? ' sending-planning__picker-group--nested' : ''}`}>
    <summary><input ref={checkbox} type="checkbox" className="sending-planning__group-checkbox"
      aria-label={`Выбрать группу ${group.label}`} checked={included === group.cargo.length} disabled={!editable.length}
      onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onChange={event => onSelect(editable.map(cargo => cargo.number), event.target.checked)} />
      <span><b>{group.label}</b><small>{group.cargo.length} перев. · {planningNumber(group.weight)} кг · {planningNumber(group.volume, 2)} м³</small>
      {included > 0 && <small>Выбрано: {included} из {group.cargo.length}</small>}</span><ChevronDown size={16} /></summary>
    <div className="sending-planning__picker-group-actions">
      <button type="button" className="filter-button" disabled={!editable.length}
        onClick={() => onSelect(editable.map(cargo => cargo.number), !allIncluded)}>{allIncluded ? 'Убрать группу' : 'Добавить группу'}</button>
    </div>
    {group.children ? <div className="sending-planning__picker-children">
      {group.children.slice(0, limit).map(child => <CandidateGroup key={child.key} group={child} selected={selected} locked={locked} onSelect={onSelect} nested />)}
    </div> : group.cargo.slice(0, limit).map(cargo => <Candidate key={cargo.number} cargo={cargo} selected={selected} locked={locked} onSelect={onSelect} />)}
    {hasMore && <button type="button" className="filter-button" onClick={() => setLimit(value => value + 100)}>{group.children ? 'Показать ещё группы' : 'Показать ещё перевозки'}</button>}
  </details>;
}

export function PlanningCargoPicker({ candidates, cargoNumbers, locked, search, onSearch, onSelect }: {
  candidates: TmsCargo[]; cargoNumbers: string[]; locked: Set<string>; search: string;
  onSearch: (search: string) => void; onSelect: Selection['onSelect'];
}) {
  const [view, setView] = useState<PlanningPickerView>('cargo');
  const [limit, setLimit] = useState(100);
  useEffect(() => setLimit(100), [candidates, view]);
  const selected = useMemo(() => new Set(cargoNumbers), [cargoNumbers]);
  const groups = useMemo(() => view === 'cargo' ? [] : groupPickerHierarchy(candidates, view), [candidates, view]);
  const hasMore = limit < (view === 'cargo' ? candidates.length : groups.length);
  return <section className="sending-planning__picker" aria-label="Неотправленные перевозки">
    <input type="search" aria-label="Поиск перевозок" placeholder="Номер, участник перевозки или дата" value={search} onChange={event => onSearch(event.target.value)} />
    <div className="sending-planning__tabs sending-planning__picker-views" role="group" aria-label="Просмотр доступных перевозок">
      {PICKER_VIEWS.map(item => <button type="button" key={item.value} aria-pressed={view === item.value} onClick={() => setView(item.value)}>{item.label}</button>)}
    </div>
    <p className="sending-planning__muted">Доступные перевозки по маршруту: {candidates.length}</p>
    {view === 'date' && <p className="sending-planning__muted">По дате поступления на склад</p>}
    <div className="sending-planning__picker-list">
      {view === 'cargo' ? candidates.slice(0, limit).map(cargo => <Candidate key={cargo.number} cargo={cargo} selected={selected} locked={locked} onSelect={onSelect} />)
        : groups.slice(0, limit).map(group => <CandidateGroup key={`${view}:${group.key}`} group={group} selected={selected} locked={locked} onSelect={onSelect} />)}
      {!candidates.length && <p className="sending-planning__muted">Нет перевозок по выбранным условиям</p>}
      {hasMore && <button type="button" className="filter-button" onClick={() => setLimit(value => value + 100)}>{view === 'cargo' ? 'Показать ещё' : 'Показать ещё группы'}</button>}
    </div>
  </section>;
}
