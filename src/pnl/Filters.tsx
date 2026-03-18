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

export interface FiltersState {
  dateFrom: string; // YYYY-MM
  dateTo: string;   // YYYY-MM
  direction: string;
  transportType: string;
}

interface FiltersProps extends FiltersState {
  onChange: (key: string, value: string | number) => void;
}

function monthStart(ym: string): string {
  return `${ym}-01`;
}

function monthEnd(ym: string): string {
  const [yRaw, mRaw] = String(ym || '').split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return '';
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export function filtersToParams(f: FiltersState): Record<string, string> {
  const fromYm = String(f.dateFrom || '').trim();
  const toYm = String(f.dateTo || '').trim();
  const normalizedFrom = /^\d{4}-\d{2}$/.test(fromYm) ? fromYm : toYm;
  const normalizedTo = /^\d{4}-\d{2}$/.test(toYm) ? toYm : fromYm;
  const finalFromYm = normalizedFrom && normalizedTo && normalizedFrom <= normalizedTo ? normalizedFrom : normalizedTo;
  const finalToYm = normalizedFrom && normalizedTo && normalizedFrom <= normalizedTo ? normalizedTo : normalizedFrom;
  const p: Record<string, string> = {
    from: monthStart(finalFromYm),
    to: monthEnd(finalToYm),
  };
  if (f.direction !== 'all') p.direction = f.direction;
  if (f.transportType !== 'all') p.transportType = f.transportType;
  return p;
}

export function defaultFiltersState(): FiltersState {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { dateFrom: ym, dateTo: ym, direction: 'all', transportType: 'all' };
}

export function Filters({ dateFrom, dateTo, direction, transportType, onChange }: FiltersProps) {
  const panelStyle = {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-sm)',
  } as const;
  const labelStyle = { color: 'var(--color-text-secondary)' } as const;
  const inputStyle = {
    background: 'var(--color-bg-input)',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
  } as const;

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl" style={panelStyle}>
      <div>
        <label className="block text-xs mb-1" style={labelStyle}>Период с</label>
        <input
          type="month"
          value={dateFrom}
          onChange={(e) => onChange('dateFrom', e.target.value)}
          className="rounded-lg px-3 py-2 text-sm"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-xs mb-1" style={labelStyle}>Период по</label>
        <input
          type="month"
          value={dateTo}
          onChange={(e) => onChange('dateTo', e.target.value)}
          className="rounded-lg px-3 py-2 text-sm"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-xs mb-1" style={labelStyle}>Направление</label>
        <select value={direction} onChange={(e) => onChange('direction', e.target.value)}
          className="rounded-lg px-3 py-2 text-sm"
          style={inputStyle}>
          {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs mb-1" style={labelStyle}>Тип перевозки</label>
        <select value={transportType} onChange={(e) => onChange('transportType', e.target.value)}
          className="rounded-lg px-3 py-2 text-sm"
          style={inputStyle}>
          {TRANSPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
    </div>
  );
}
