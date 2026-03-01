import { useState, useEffect } from 'react';
import { pnlGet, pnlPost } from './api';
import { MONTHS } from './constants';
import { Save, CheckCircle } from 'lucide-react';

type Direction = 'MSK_TO_KGD' | 'KGD_TO_MSK';
type TransportType = 'AUTO' | 'FERRY';
interface RowState { direction: Direction; transportType: TransportType; name: string; weightKg: string; volume: string; paidWeightKg: string; revenue: string; }
function parseNum(s: string) { return parseFloat(String(s).replace(/\s/g, '').replace(/,/g, '.')) || 0; }

export function UploadSalesView() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    pnlGet<any>('/api/sales/manual', { month: String(month), year: String(year) }).then((data) => {
      if (data?.rows) setRows(data.rows.map((x: any) => ({ direction: x.direction || 'MSK_TO_KGD', transportType: x.transportType || 'AUTO', name: x.name || '', weightKg: x.weightKg != null ? String(x.weightKg) : '', volume: x.volume != null ? String(x.volume) : '', paidWeightKg: x.paidWeightKg != null ? String(x.paidWeightKg) : '', revenue: x.revenue != null ? String(x.revenue) : '' })));
      else setRows([]);
    }).catch(() => setRows([])).finally(() => setLoading(false));
  }, [month, year]);

  const updateRow = (i: number, field: keyof RowState, value: string) => { setRows((p) => p.map((r, idx) => idx === i ? { ...r, [field]: value } : r)); setSaved(false); setError(null); };

  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await pnlPost<any>('/api/sales/manual', { month, year, rows: rows.map((r) => ({ direction: r.direction, transportType: r.transportType, weightKg: parseNum(r.weightKg), volume: parseNum(r.volume), paidWeightKg: parseNum(r.paidWeightKg), revenue: parseNum(r.revenue) })) });
      if (res?.error) throw new Error(res.error);
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
    finally { setSaving(false); }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Продажи</h1><p className="text-slate-500">Ручной ввод по направлениям и типу перевозки.</p></div>
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm" style={{ maxWidth: 720 }}>
        <div className="flex items-center gap-4 mb-6">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </div>
        {loading ? <div className="animate-pulse text-slate-500">Загрузка...</div> : rows.length === 0 ? <div className="py-8 text-center text-slate-500">Добавьте категории с направлением в справочнике доходов.</div> : (
          <div className="space-y-6">
            {rows.map((row, index) => (
              <div key={`${row.direction}-${row.transportType}`} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <h3 className="font-medium text-slate-800 mb-3">{row.name}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['weightKg', 'volume', 'paidWeightKg', 'revenue'] as const).map((f) => (
                    <div key={f}><label className="block text-xs text-slate-500 mb-1">{{ weightKg: 'Вес, кг', volume: 'Объём', paidWeightKg: 'Платный вес, кг', revenue: 'Итого, ₽' }[f]}</label>
                    <input type="text" value={row[f]} onChange={(e) => updateRow(index, f, e.target.value)} placeholder="0" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 text-right" /></div>
                  ))}
                </div>
              </div>
            ))}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-lg font-semibold text-slate-900">Итого: {rows.reduce((s, r) => s + parseNum(r.revenue), 0).toLocaleString('ru-RU')} ₽</div>
              <div className="flex items-center gap-4">
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: '#2563eb' }}><Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить'}</button>
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
