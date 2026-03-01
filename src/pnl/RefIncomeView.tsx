import { useEffect, useState } from 'react';
import { pnlGet, pnlPost, pnlPatch, pnlDelete } from './api';
import { DIRECTION_LABELS, DIRECTIONS } from './constants';
import { Plus, Trash2 } from 'lucide-react';

const TRANSPORT_OPTIONS = [{ value: '', label: '—' }, { value: 'AUTO', label: 'авто' }, { value: 'FERRY', label: 'паром' }] as const;

interface Category { id: string; name: string; direction: string; transportType: string; sortOrder: number; }

export function RefIncomeView() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', direction: 'MSK_TO_KGD', transportType: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => pnlGet<Category[]>('/api/income-categories').then((d) => setCats(Array.isArray(d) ? d : []));

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form.name.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await pnlPost<any>('/api/income-categories', { name: form.name.trim(), direction: form.direction, transportType: form.transportType || '' });
      if (res?.error) { setError(res.error); return; }
      setForm({ name: '', direction: 'MSK_TO_KGD', transportType: '' }); await load();
    } finally { setSaving(false); }
  };

  const handleUpdate = async (id: string, data: { direction?: string; transportType?: string }) => { setSaving(true); await pnlPatch(`/api/income-categories/${id}`, data); await load(); setSaving(false); };
  const handleDelete = async (id: string) => { if (!confirm('Удалить?')) return; await pnlDelete(`/api/income-categories/${id}`); await load(); };

  const byGroup = cats.reduce((acc: Record<string, Category[]>, c) => { const key = c.transportType ? `${c.direction}|${c.transportType}` : c.direction; (acc[key] = acc[key] || []).push(c); return acc; }, {});
  const getGroupLabel = (key: string) => { const [dir, transport] = key.split('|'); return `${(DIRECTION_LABELS as Record<string, string>)[dir || key] ?? key}${transport ? ` ${TRANSPORT_OPTIONS.find((o) => o.value === transport)?.label ?? transport}` : ''}`; };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Справочник доходов</h1><p className="text-slate-500">Категории по направлениям для ручного ввода выручки</p></div>
      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-medium text-slate-800">Добавить категорию</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="block text-sm text-slate-600 mb-1">Название</label><input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Перевозки МСК→КГД" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900" /></div>
          <div><label className="block text-sm text-slate-600 mb-1">Направление</label><select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{DIRECTIONS.map((d) => <option key={d} value={d}>{(DIRECTION_LABELS as Record<string, string>)[d]}</option>)}</select></div>
          <div><label className="block text-sm text-slate-600 mb-1">Тип перевозки</label><select value={form.transportType} onChange={(e) => setForm((f) => ({ ...f, transportType: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{TRANSPORT_OPTIONS.map((o) => <option key={o.value || '_'} value={o.value}>{o.label}</option>)}</select></div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: '#2563eb' }}><Plus className="w-4 h-4" /> Добавить</button>
      </form>
      <div className="space-y-4">
        {Object.entries(byGroup).map(([key, items]) => (
          <div key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 font-medium text-slate-700">{getGroupLabel(key)}</div>
            <table className="min-w-full"><thead><tr className="border-b border-slate-100"><th className="px-4 py-2 text-left text-sm text-slate-600">Название</th><th className="px-4 py-2 text-left text-sm text-slate-600">Направление</th><th className="px-4 py-2 text-left text-sm text-slate-600">Тип перевозки</th><th className="px-4 py-2 w-24"></th></tr></thead>
              <tbody>{items.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-900">{c.name}</td>
                  <td className="px-4 py-2"><select value={c.direction} onChange={(e) => handleUpdate(c.id, { direction: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-slate-900">{DIRECTIONS.map((d) => <option key={d} value={d}>{(DIRECTION_LABELS as Record<string, string>)[d]}</option>)}</select></td>
                  <td className="px-4 py-2"><select value={c.transportType ?? ''} onChange={(e) => handleUpdate(c.id, { transportType: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-slate-900">{TRANSPORT_OPTIONS.map((o) => <option key={o.value || '_'} value={o.value}>{o.label}</option>)}</select></td>
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
