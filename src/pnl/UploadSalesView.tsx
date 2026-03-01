import { useState, useEffect, useMemo } from 'react';
import { pnlGet, pnlPost } from './api';
import { MONTHS, DIRECTION_LABELS } from './constants';
import { Save, CheckCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

type Direction = 'MSK_TO_KGD' | 'KGD_TO_MSK';
type TransportType = 'AUTO' | 'FERRY';

interface AutoRow {
  customer: string;
  direction: Direction;
  transportType: TransportType;
  weightKg: number;
  volume: number;
  paidWeightKg: number;
  revenue: number;
  count: number;
}

interface GroupTotals {
  weightKg: number;
  volume: number;
  paidWeightKg: number;
  revenue: number;
  count: number;
  rows: AutoRow[];
}

const TRANSPORT_LABELS: Record<TransportType, string> = { AUTO: 'Авто', FERRY: 'Паром' };

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

export function UploadSalesView() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<AutoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const load = () => {
    setLoading(true);
    setSaved(false);
    setError(null);
    pnlGet<any>('/api/pnl-sales-auto', { month: String(month), year: String(year) })
      .then((data) => setRows(Array.isArray(data?.rows) ? data.rows : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [month, year]);

  const grouped = useMemo(() => {
    const map = new Map<string, GroupTotals>();
    for (const r of rows) {
      const key = `${r.direction}:${r.transportType}`;
      const g = map.get(key) ?? { weightKg: 0, volume: 0, paidWeightKg: 0, revenue: 0, count: 0, rows: [] };
      g.weightKg += r.weightKg;
      g.volume += r.volume;
      g.paidWeightKg += r.paidWeightKg;
      g.revenue += r.revenue;
      g.count += r.count;
      g.rows.push(r);
      map.set(key, g);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalWeight = rows.reduce((s, r) => s + r.weightKg, 0);
  const totalPW = rows.reduce((s, r) => s + r.paidWeightKg, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const salesRows: { direction: string; transportType: string; weightKg: number; volume: number; paidWeightKg: number; revenue: number }[] = [];
      for (const [, g] of grouped) {
        for (const r of g.rows) {
          const existing = salesRows.find((s) => s.direction === r.direction && s.transportType === r.transportType);
          if (existing) {
            existing.weightKg += r.weightKg;
            existing.volume += r.volume;
            existing.paidWeightKg += r.paidWeightKg;
            existing.revenue += r.revenue;
          } else {
            salesRows.push({ direction: r.direction, transportType: r.transportType, weightKg: r.weightKg, volume: r.volume, paidWeightKg: r.paidWeightKg, revenue: r.revenue });
          }
        }
      }
      const res = await pnlPost<any>('/api/sales/manual', { month, year, rows: salesRows });
      if (res?.error) throw new Error(res.error);
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setSaving(false); }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Продажи</h1>
        <p className="text-slate-500">Автоматическая агрегация перевозок по заказчикам, направлениям и типу.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Обновить
          </button>
        </div>

        {loading ? (
          <div className="animate-pulse text-slate-500 py-8 text-center">Загрузка данных из перевозок...</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-500">Нет перевозок за выбранный период.</div>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{totalCount}</div>
                <div className="text-xs text-blue-600">Перевозок</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{fmtCurrency(totalRevenue)} ₽</div>
                <div className="text-xs text-green-600">Выручка</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-700">{fmt(totalWeight)} кг</div>
                <div className="text-xs text-purple-600">Вес</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-700">{fmt(totalPW)} кг</div>
                <div className="text-xs text-amber-600">Платный вес</div>
              </div>
            </div>

            {/* Grouped data */}
            {grouped.map(([key, group]) => {
              const [dir, transport] = key.split(':') as [Direction, TransportType];
              const expanded = expandedGroups.has(key);
              const dirLabel = (DIRECTION_LABELS as Record<string, string>)[dir] ?? dir;

              return (
                <div key={key} className="rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                      <span className="font-semibold text-slate-800">{dirLabel}</span>
                      <span className="text-sm px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{TRANSPORT_LABELS[transport]}</span>
                      <span className="text-sm text-slate-500">{group.count} перевозок</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-slate-900">{fmtCurrency(group.revenue)} ₽</span>
                      <span className="text-slate-400 mx-2">|</span>
                      <span className="text-sm text-slate-600">{fmt(group.paidWeightKg)} кг ПВ</span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-slate-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white border-b border-slate-100">
                            <th className="px-5 py-2 text-left text-slate-600 font-medium">Заказчик</th>
                            <th className="px-3 py-2 text-right text-slate-600 font-medium">Кол-во</th>
                            <th className="px-3 py-2 text-right text-slate-600 font-medium">Вес, кг</th>
                            <th className="px-3 py-2 text-right text-slate-600 font-medium">ПВ, кг</th>
                            <th className="px-3 py-2 text-right text-slate-600 font-medium">Объём</th>
                            <th className="px-5 py-2 text-right text-slate-600 font-medium">Сумма, ₽</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((r, i) => (
                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-5 py-2 text-slate-800">{r.customer}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{r.count}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{fmt(r.weightKg)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{fmt(r.paidWeightKg)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{fmt(r.volume)}</td>
                              <td className="px-5 py-2 text-right font-medium text-slate-900">{fmtCurrency(r.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-medium">
                            <td className="px-5 py-2 text-slate-700">Итого</td>
                            <td className="px-3 py-2 text-right text-slate-700">{group.count}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{fmt(group.weightKg)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{fmt(group.paidWeightKg)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{fmt(group.volume)}</td>
                            <td className="px-5 py-2 text-right text-slate-900">{fmtCurrency(group.revenue)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Save button */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-lg font-semibold text-slate-900">
                Итого выручка: {fmtCurrency(totalRevenue)} ₽
              </div>
              <div className="flex items-center gap-4">
                <button onClick={handleSave} disabled={saving || rows.length === 0} className="px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: '#2563eb' }}>
                  <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить в PNL'}
                </button>
                {saved && <span className="flex items-center gap-2 text-sm" style={{ color: '#10b981' }}><CheckCircle className="w-4 h-4" /> Сохранено</span>}
                {error && <span className="text-red-600 text-sm">{error}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
