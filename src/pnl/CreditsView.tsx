import { useEffect, useState } from 'react';
import { Filters } from './Filters';
import { pnlGet, pnlPost } from './api';
import { Plus, CreditCard, FileText } from 'lucide-react';

function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽';
}
function formatDate(d: string | Date) { return new Date(d).toLocaleDateString('ru-RU'); }

interface Payment { id: string; date: string; counterparty: string; purpose: string | null; amount: number; type: string; }

export function CreditsView() {
  const [filters, setFilters] = useState({ from: '', to: '', direction: 'all', transportType: 'all' });
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), counterparty: '', purpose: '', amount: '', type: 'CREDIT' as 'CREDIT' | 'LEASING' });
  const [saving, setSaving] = useState(false);
  const updateFilter = (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value }));

  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (typeFilter !== 'all') params.type = typeFilter;

  useEffect(() => {
    pnlGet<Payment[]>('/api/credits', params).then(setPayments).finally(() => setLoading(false));
  }, [filters.from, filters.to, typeFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.counterparty || !form.amount) return;
    setSaving(true);
    try {
      const newPay = await pnlPost<Payment>('/api/credits', {
        date: form.date, counterparty: form.counterparty, purpose: form.purpose || null,
        amount: parseFloat(form.amount.replace(/\s/g, '').replace(/,/g, '.')), type: form.type,
      });
      setPayments((p) => [newPay, ...p]);
      setForm({ date: new Date().toISOString().slice(0, 10), counterparty: '', purpose: '', amount: '', type: 'CREDIT' });
    } catch { alert('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  const total = payments.reduce((s, p) => s + Math.abs(p.amount), 0);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Кредиты</h1><p className="text-slate-500">Платежи по кредитам и лизингу (ниже EBITDA)</p></div>
      <Filters {...filters} onChange={updateFilter} />
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-600">Тип:</span>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900">
          <option value="all">Все</option><option value="CREDIT">Кредит</option><option value="LEASING">Лизинг</option>
        </select>
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2"><Plus className="w-5 h-5" /> Добавить платёж</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Дата</label><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900" required /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Тип</label><select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"><option value="CREDIT">Кредит</option><option value="LEASING">Лизинг</option></select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Контрагент</label><input type="text" value={form.counterparty} onChange={(e) => setForm((f) => ({ ...f, counterparty: e.target.value }))} placeholder="Банк / лизинговая компания" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900" required /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Назначение</label><input type="text" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="Оплата по договору №..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Сумма (₽)</label><input type="text" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900" required /></div>
              <button type="submit" disabled={saving} className="w-full py-3 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: '#2563eb' }}>{saving ? 'Сохранение...' : 'Добавить'}</button>
            </form>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-semibold text-slate-900">Платежи</h2>
              <span className="text-sm text-slate-500">Итого: {formatRub(total)}</span>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50" style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Дата</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Тип</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Контрагент</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Назначение</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Загрузка...</td></tr>
                  : payments.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Нет платежей</td></tr>
                  : payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-700">{formatDate(p.date)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: p.type === 'LEASING' ? '#fef3c7' : '#dbeafe', color: p.type === 'LEASING' ? '#92400e' : '#1e40af' }}>
                          {p.type === 'LEASING' ? <FileText className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
                          {p.type === 'LEASING' ? 'Лизинг' : 'Кредит'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{p.counterparty}</td>
                      <td className="px-4 py-3 text-sm text-slate-600" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.purpose || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">{formatRub(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
