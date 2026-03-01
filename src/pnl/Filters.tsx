import { DIRECTION_LABELS, MONTHS } from './constants';

const DIRECTIONS = [
  { value: 'all', label: 'Все' },
  ...Object.entries(DIRECTION_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

const TRANSPORT_TYPES = [
  { value: 'all', label: 'Все' },
  { value: 'AUTO', label: 'Авто' },
  { value: 'FERRY', label: 'Паром' },
];

export interface FiltersState {
  month: number;
  year: number;
  direction: string;
  transportType: string;
}

interface FiltersProps extends FiltersState {
  onChange: (key: string, value: string | number) => void;
}

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

export function filtersToParams(f: FiltersState): Record<string, string> {
  const from = new Date(f.year, f.month - 1, 1);
  const to = new Date(f.year, f.month, 0, 23, 59, 59);
  const p: Record<string, string> = {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
  if (f.direction !== 'all') p.direction = f.direction;
  if (f.transportType !== 'all') p.transportType = f.transportType;
  return p;
}

export function defaultFiltersState(): FiltersState {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear(), direction: 'all', transportType: 'all' };
}

export function Filters({ month, year, direction, transportType, onChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Месяц</label>
        <select value={month} onChange={(e) => onChange('month', Number(e.target.value))}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900">
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Год</label>
        <select value={year} onChange={(e) => onChange('year', Number(e.target.value))}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900">
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Направление</label>
        <select value={direction} onChange={(e) => onChange('direction', e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900">
          {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Тип перевозки</label>
        <select value={transportType} onChange={(e) => onChange('transportType', e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900">
          {TRANSPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
    </div>
  );
}
