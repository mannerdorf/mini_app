import { useEffect, useState } from 'react';
import { pnlGet, pnlPost } from './api';
import { DEPARTMENT_LABELS, DIRECTION_LABELS, MONTHS } from './constants';
import { Save } from 'lucide-react';

const REVENUE_DIRECTIONS = ['MSK_TO_KGD', 'KGD_TO_MSK'] as const;
const REVENUE_TRANSPORT = [{ value: 'AUTO', label: 'авто' }, { value: 'FERRY', label: 'паром' }] as const;
function revenueKey(categoryId: string, direction: string, transportType: string) { return `${categoryId}:${direction}:${transportType}`; }
function formatRub(n: number) { return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽'; }

export function EntryView() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [incomeCats, setIncomeCats] = useState<any[]>([]);
  const [expenseCats, setExpenseCats] = useState<any[]>([]);
  const [revenues, setRevenues] = useState<Record<string, string>>({});
  const [expenses, setExpenses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const period = `${year}-${String(month).padStart(2, '0')}-01`;

  useEffect(() => {
    Promise.all([pnlGet<any[]>('/api/income-categories'), pnlGet<any[]>('/api/expense-categories')]).then(([inc, exp]) => { setIncomeCats(inc); setExpenseCats(exp); setLoading(false); });
  }, []);

  useEffect(() => {
    pnlGet<any>('/api/manual-entry', { month: String(month), year: String(year) }).then((data) => {
      const rev: Record<string, string> = {};
      (data.revenues || []).forEach((r: any) => { rev[revenueKey(r.categoryId, r.direction ?? '', r.transportType ?? '')] = String(r.amount || ''); });
      setRevenues(rev);
      const exp: Record<string, string> = {};
      (data.expenses || []).forEach((e: any) => { exp[e.categoryId] = String(e.amount || ''); });
      setExpenses(exp);
    });
  }, [month, year]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const revenueEntries = incomeCats.flatMap((c) => REVENUE_DIRECTIONS.flatMap((d) => REVENUE_TRANSPORT.map((t) => ({
        categoryId: c.id, amount: parseFloat((revenues[revenueKey(c.id, d, t.value)] || '0').replace(/\s/g, '').replace(/,/g, '.')) || 0, direction: d, transportType: t.value,
      }))));
      await pnlPost('/api/manual-entry', { period, revenues: revenueEntries, expenses: expenseCats.map((c) => ({ categoryId: c.id, amount: parseFloat((expenses[c.id] || '0').replace(/\s/g, '').replace(/,/g, '.')) || 0 })) });
    } finally { setSaving(false); }
  };

  const totalRevenue = Object.values(revenues).reduce((s, v) => s + (parseFloat(String(v).replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
  const totalExpense = Object.values(expenses).reduce((s, v) => s + (parseFloat(v.replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);
  const expByDept = expenseCats.reduce((acc: Record<string, number>, c) => { acc[c.department] = (acc[c.department] || 0) + (parseFloat((expenses[c.id] || '0').replace(/\s/g, '').replace(/,/g, '.')) || 0); return acc; }, {});

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Ручной ввод</h1><p className="text-slate-500">Доходы и расходы за период</p></div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{[year - 2, year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </div>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: '#2563eb' }}><Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
      {loading ? <div className="animate-pulse">Загрузка...</div> : (
        <div className="grid lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Доходы</h2>
            <div className="space-y-3">
              {incomeCats.length === 0 ? <p className="text-slate-500 text-sm">Добавьте категории в справочник доходов</p> : incomeCats.map((c) => (
                <div key={c.id} className="border-b border-slate-100 pb-3 last:border-0">
                  <div className="font-medium text-slate-700 mb-2">{c.name} <span className="text-slate-400 text-sm">({(DIRECTION_LABELS as Record<string, string>)[c.direction]})</span></div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {REVENUE_DIRECTIONS.flatMap((d) => REVENUE_TRANSPORT.map((t) => (
                      <div key={`${d}-${t.value}`} className="flex items-center gap-2">
                        <label className="flex-1 text-slate-600 text-sm">{(DIRECTION_LABELS as Record<string, string>)[d]} {t.label}</label>
                        <input type="text" value={revenues[revenueKey(c.id, d, t.value)] ?? ''} onChange={(e) => setRevenues((r) => ({ ...r, [revenueKey(c.id, d, t.value)]: e.target.value }))} placeholder="0" className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-slate-900 text-right text-sm" />
                      </div>
                    )))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t font-medium">Итого доходы: {formatRub(totalRevenue)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Расходы по подразделениям</h2>
            <div className="space-y-6">
              {expenseCats.length === 0 ? <p className="text-slate-500 text-sm">Добавьте категории в справочник расходов</p> : Object.entries(expenseCats.reduce((acc: Record<string, any[]>, c) => { (acc[c.department] = acc[c.department] || []).push(c); return acc; }, {})).map(([dept, items]) => (
                <div key={dept} className="border-b border-slate-100 pb-4 last:border-0">
                  <div className="font-medium text-slate-800 mb-2">{(DEPARTMENT_LABELS as Record<string, string>)[dept] ?? dept}</div>
                  <div className="space-y-2">
                    {items.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-4">
                        <label className="flex-1 text-slate-600 text-sm">{c.name}</label>
                        <input type="text" value={expenses[c.id] ?? ''} onChange={(e) => setExpenses((ex) => ({ ...ex, [c.id]: e.target.value }))} placeholder="0" className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 text-right" />
                      </div>
                    ))}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Итого: {formatRub(expByDept[dept] ?? 0)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t font-medium">Итого расходы: {formatRub(totalExpense)}</div>
          </div>
        </div>
      )}
      {!loading && (incomeCats.length > 0 || expenseCats.length > 0) && (
        <div className="bg-slate-50 rounded-xl p-4 text-center">
          <span className="text-slate-700">Итог за период: </span>
          <span className="font-semibold" style={{ color: totalRevenue - totalExpense >= 0 ? '#10b981' : '#ef4444' }}>{formatRub(totalRevenue - totalExpense)}</span>
        </div>
      )}
    </div>
  );
}
