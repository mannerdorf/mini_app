import { useEffect, useMemo, useState } from 'react';
import { pnlGet, pnlPost, pnlPatch, pnlDelete } from './api';
import { SUBDIVISIONS } from './constants';
import { Plus, Trash2, Info } from 'lucide-react';

interface BaseCategory { id: string; name: string; costType?: string; sortOrder?: number; }
interface Category { id: string; name: string; department: string; type: string; logisticsStage: string | null; sortOrder: number; expenseCategoryId?: string; }
type ExpenseCategoryPrefill = {
  requestId: string;
  expenseCategoryId?: string;
  categoryName?: string;
  subdivision?: string;
  type?: 'COGS' | 'OPEX' | 'CAPEX';
};

const COST_TYPE_LEGEND = [
  {
    type: 'COGS',
    title: 'COGS (Cost of Goods Sold) — себестоимость перевозки',
    desc: 'Прямые затраты на доставку груза, которые можно отнести к конкретной перевозке. Уменьшают валовую прибыль и влияют на маржу за кг.',
    articles: 'Топливо, Запасные части, Ремонт и обслуживание ТС, Магистраль, Заборная логистика, Прочее (таможня, накладные по перевозке)',
    borderColor: '#3b82f6',
  },
  {
    type: 'OPEX',
    title: 'OPEX (Operating Expenses) — операционные расходы',
    desc: 'Затраты на ведение бизнеса: офис, персонал, аренда, страхование. Не привязаны к конкретной перевозке, учитываются в EBITDA.',
    articles: 'Зарплата, Офис, Аренда, Страхование, Юристы, Маркетинг, Административные расходы',
    borderColor: '#10b981',
  },
  {
    type: 'CAPEX',
    title: 'CAPEX (Capital Expenditures) — капитальные затраты',
    desc: 'Единоразовые инвестиции в основные средства: покупка ТС, оборудования. Не входят в EBITDA, вычитаются после.',
    articles: 'Покупка ТС, Оборудование, Недвижимость, Крупные единоразовые инвестиции',
    borderColor: '#f59e0b',
  },
];

export function RefExpensesView({ initialPrefill = null }: { initialPrefill?: ExpenseCategoryPrefill | null }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [baseCats, setBaseCats] = useState<BaseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ expenseCategoryId: '', subdivision: 'pickup_msk', type: 'COGS' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => pnlGet<Category[]>('/api/expense-categories').then((d) => setCats(Array.isArray(d) ? d : []));

  useEffect(() => {
    Promise.all([
      load(),
      fetch(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/expense-request-categories`)
        .then((r) => (r.ok ? r.json() : [])).then((d: BaseCategory[]) => setBaseCats(Array.isArray(d) ? d : [])),
    ]).finally(() => setLoading(false));
  }, []);

  const allowedSubdivisionIds = useMemo(() => new Set(SUBDIVISIONS.map((s) => s.id)), []);

  useEffect(() => {
    if (!initialPrefill) return;
    const normalizedName = String(initialPrefill.categoryName || '').trim().toLowerCase();
    const resolvedExpenseCategoryId =
      (initialPrefill.expenseCategoryId && baseCats.some((c) => c.id === initialPrefill.expenseCategoryId)
        ? initialPrefill.expenseCategoryId
        : undefined)
      || baseCats.find((c) => c.name.trim().toLowerCase() === normalizedName)?.id
      || '';
    const resolvedSubdivision =
      initialPrefill.subdivision && allowedSubdivisionIds.has(initialPrefill.subdivision)
        ? initialPrefill.subdivision
        : 'administration';
    setForm({
      expenseCategoryId: resolvedExpenseCategoryId,
      subdivision: resolvedSubdivision,
      type: 'OPEX',
    });
  }, [initialPrefill, baseCats, allowedSubdivisionIds]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.expenseCategoryId.trim()) return;
    setSaving(true); setError(null);
    try {
      const sub = SUBDIVISIONS.find((s) => s.id === form.subdivision);
      if (!sub) return;
      const res = await pnlPost<any>('/api/expense-categories', {
        expenseCategoryId: form.expenseCategoryId,
        department: sub.department,
        type: form.type,
        logisticsStage: sub.logisticsStage,
      });
      if (res?.error) { setError(res.error); return; }
      setForm({ expenseCategoryId: '', subdivision: 'pickup_msk', type: 'COGS' });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось добавить категорию');
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
      <div><h1 className="text-2xl font-bold text-slate-900">Справочник расходов</h1><p className="text-slate-500">Категории по подразделениям для ручного ввода затрат (статьи те же, что в заявках на расходы)</p></div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h3 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-600" />
          Типы затрат в привязке к статьям
        </h3>
        <div className="space-y-4">
          {COST_TYPE_LEGEND.map((item) => (
            <div key={item.type} className="pl-3 py-1" style={{ borderLeft: `4px solid ${item.borderColor}` }}>
              <div className="font-semibold text-slate-800">{item.title}</div>
              <p className="text-sm text-slate-600 mt-0.5">{item.desc}</p>
              <p className="text-xs text-slate-500 mt-1">
                <span className="font-medium">Типичные статьи:</span> {item.articles}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Одна и та же статья может относиться к разным типам в зависимости от подразделения и назначения. Например, «Топливо» для магистрали — COGS; «Ремонт офиса» — OPEX.
        </p>
      </div>

      <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-medium text-slate-800">Добавить категорию</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Статья расхода</label>
            <select value={form.expenseCategoryId} onChange={(e) => setForm((f) => ({ ...f, expenseCategoryId: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900" required>
              <option value="">Выберите</option>
              {baseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-sm text-slate-600 mb-1">Подразделение</label><select value={form.subdivision} onChange={(e) => setForm((f) => ({ ...f, subdivision: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{SUBDIVISIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div><label className="block text-sm text-slate-600 mb-1">Тип</label><select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"><option value="COGS">COGS</option><option value="OPEX">OPEX</option><option value="CAPEX">CAPEX</option></select></div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={saving || baseCats.length === 0} className="px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: '#2563eb' }}><Plus className="w-4 h-4" /> Добавить</button>
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
