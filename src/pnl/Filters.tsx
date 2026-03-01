import { DIRECTION_LABELS } from './constants';

const DIRECTIONS = [
  { value: 'all', label: 'Все' },
  ...Object.entries(DIRECTION_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

const TRANSPORT_TYPES = [
  { value: 'all', label: 'Все' },
  { value: 'AUTO', label: 'Авто' },
  { value: 'FERRY', label: 'Паром' },
];

interface FiltersProps {
  from: string;
  to: string;
  direction: string;
  transportType: string;
  onChange: (key: string, value: string) => void;
}

export function Filters({ from, to, direction, transportType, onChange }: FiltersProps) {
  const setDefaultPeriod = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    onChange('from', start.toISOString().slice(0, 10));
    onChange('to', now.toISOString().slice(0, 10));
  };

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Период с</label>
        <input type="date" value={from} onChange={(e) => onChange('from', e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900" />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">по</label>
        <input type="date" value={to} onChange={(e) => onChange('to', e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900" />
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
      <div className="flex items-end">
        <button onClick={setDefaultPeriod}
          className="px-4 py-2 text-sm text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
          Текущий месяц
        </button>
      </div>
    </div>
  );
}
