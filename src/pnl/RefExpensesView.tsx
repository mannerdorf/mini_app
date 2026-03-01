import { useEffect, useState } from 'react';
import { pnlGet, pnlPost, pnlPatch, pnlDelete } from './api';
import { SUBDIVISIONS } from './constants';
import { Plus, Trash2 } from 'lucide-react';

interface Category { id: string; name: string; department: string; type: string; logisticsStage: string | null; sortOrder: number; }

export function RefExpensesView() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', subdivision: 'pickup_msk', type: 'COGS' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => pnlGet<Category[]>('/api/expense-categories').then((d) => setCats(Array.isArray(d) ? d : []));

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form.name.trim()) return;
    setSaving(true); setError(null);
    try {
      const sub = SUBDIVISIONS.find((s) => s.id === form.subdivision);
      if (!sub) return;
      const res = await pnlPost<any>('/api/expense-categories', { name: form.name, department: sub.department, type: form.type, logisticsStage: sub.logisticsStage });
      if (res?.error) { setError(res.error); return; }
      setForm({ name: '', subdivision: 'pickup_msk', type: 'COGS' }); await load();
    } finally { setSaving(false); }
  };

  const handleUpdate = async (id: string, data: Partial<Category>) => {
    setSaving(true);
    await pnlPatch(`/api/expense-categories/${id}`, data);
    await load(); setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить?')) return;
    await pnlDelete(`/api/expense-categories/${id}`); await load();
  };

  const bySubdivision = cats.reduce((acc: Record<string, Category[]>, c) => {
    const sub = SUBDIVISIONS.find((s) => s.department === c.department && s.logisticsStage === c.logisticsStage);
    const key = sub ? sub.id : c.department;
    (acc[key] = acc[key] || []).push(c); return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Справочник расходов</h1><p className="text-slate-500">Категории по подразделениям для ручного ввода затрат</p></div>
      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-medium text-slate-800">Добавить категорию</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="block text-sm text-slate-600 mb-1">Название</label><input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Топливо" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900" /></div>
          <div><label className="block text-sm text-slate-600 mb-1">Подразделение</label><select value={form.subdivision} onChange={(e) => setForm((f) => ({ ...f, subdivision: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{SUBDIVISIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div><label className="block text-sm text-slate-600 mb-1">Тип</label><select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"><option value="COGS">COGS</option><option value="OPEX">OPEX</option><option value="CAPEX">CAPEX</option></select></div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: '#2563eb' }}><Plus className="w-4 h-4" /> Добавить</button>
      </form>
      <div className="space-y-4">
        {Object.entries(bySubdivision).map(([key, items]) => (
          <div key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 font-medium text-slate-700">{SUBDIVISIONS.find((s) => s.id === key)?.label || key}</div>
            <table className="min-w-full"><thead><tr className="border-b border-slate-100"><th className="px-4 py-2 text-left text-sm text-slate-600">Название</th><th className="px-4 py-2 text-left text-sm text-slate-600">Тип</th><th className="px-4 py-2 w-24"></th></tr></thead>
              <tbody>{items.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-900">{c.name}</td>
                  <td className="px-4 py-2"><select value={c.type} onChange={(e) => handleUpdate(c.id, { type: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-slate-900"><option value="COGS">COGS</option><option value="OPEX">OPEX</option><option value="CAPEX">CAPEX</option></select></td>
                  <td className="px-4 py-2"><button onClick={() => handleDelete(c.id)} className="p-1 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
