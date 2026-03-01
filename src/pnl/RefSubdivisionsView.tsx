import { useEffect, useState } from 'react';
import { pnlGet, pnlPost, pnlDelete } from './api';
import { Plus, Trash2 } from 'lucide-react';

interface Subdivision { id: string; code?: string | null; name: string; department: string; logisticsStage: string | null; sortOrder: number; }

export function RefSubdivisionsView() {
  const [list, setList] = useState<Subdivision[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => pnlGet<Subdivision[]>('/api/subdivisions').then((d) => setList(Array.isArray(d) ? d : []));

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form.name.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await pnlPost<any>('/api/subdivisions', { name: form.name.trim() });
      if (res?.error) { setError(res.error); return; }
      setForm({ name: '' }); await load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить подразделение?')) return;
    await pnlDelete(`/api/subdivisions/${id}`); await load();
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Справочник подразделений</h1><p className="text-slate-500">Подразделения для выбора на странице расходов</p></div>
      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-medium text-slate-800">Добавить подразделение</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div style={{ minWidth: 200 }}><label className="block text-sm text-slate-600 mb-1">Название</label><input type="text" value={form.name} onChange={(e) => setForm({ name: e.target.value })} placeholder="Заборная логистика Москва" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900" /></div>
        </div>
        <p className="text-slate-500 text-sm">Код для URL создаётся автоматически из названия</p>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: '#2563eb' }}><Plus className="w-4 h-4" /> Добавить</button>
      </form>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? <div className="p-6 text-slate-500 animate-pulse">Загрузка...</div> : (
          <table className="min-w-full"><thead><tr className="border-b border-slate-100 bg-slate-50"><th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Название</th><th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Код</th><th className="px-4 py-3 w-24"></th></tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">{s.name}</td>
                <td className="px-4 py-3 text-slate-500 text-sm">{s.code ?? '—'}</td>
                <td className="px-4 py-3"><button onClick={() => handleDelete(s.id)} className="p-1 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
