import { useState, useEffect } from 'react';
import { pnlGet, pnlPost } from './api';
import { DEPARTMENT_LABELS, DIRECTION_LABELS, LOGISTICS_STAGE_LABELS, MONTHS } from './constants';
import { CheckCircle, Plus, Trash2 } from 'lucide-react';

const MAINLINE_DIRECTIONS = ['MSK_TO_KGD', 'KGD_TO_MSK'] as const;
const MAINLINE_TRANSPORT = [{ value: 'AUTO', label: 'авто' }, { value: 'FERRY', label: 'паром' }] as const;

interface ExpenseCat { id: string; name: string; department: string; type: string; logisticsStage: string | null; }
interface ExpenseRow { id: string; categoryId: string; amount: string; direction: string; transportType: string; }
interface SavedExpense {
  id?: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  comment?: string | null;
  direction?: string;
  transportType?: string;
  type?: string | null;
  department?: string | null;
  logisticsStage?: string | null;
  requestDepartment?: string | null;
  source?: 'manual' | 'expense_request' | 'timesheet_salary';
  requestStatus?: string | null;
}

function formatRub(n: number) { return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽'; }
function generateId() { return Math.random().toString(36).slice(2, 9); }
const EXPENSE_REQUESTS_STORAGE_PREFIX = 'haulz.expense_requests.';
function normalizeName(v?: string | null) { return String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '); }

function mapDepartmentToPnl(raw?: string | null): { department: string; logisticsStage: string | null } {
  const source = String(raw ?? '').trim();
  const upper = source.toUpperCase();
  const known = new Set(['LOGISTICS_MSK', 'LOGISTICS_KGD', 'ADMINISTRATION', 'DIRECTION', 'IT', 'SALES', 'SERVICE', 'GENERAL']);
  if (known.has(upper)) return { department: upper, logisticsStage: null };
  const s = source.toLowerCase().replace(/ё/g, 'е');
  if (s.includes('забор')) return { department: 'LOGISTICS_MSK', logisticsStage: 'PICKUP' };
  if (s.includes('склад москва') || s.includes('склад отправления')) return { department: 'LOGISTICS_MSK', logisticsStage: 'DEPARTURE_WAREHOUSE' };
  if (s.includes('магистрал')) return { department: 'LOGISTICS_MSK', logisticsStage: 'MAINLINE' };
  if (s.includes('склад калининград') || s.includes('склад получения')) return { department: 'LOGISTICS_KGD', logisticsStage: 'ARRIVAL_WAREHOUSE' };
  if (s.includes('последняя миля') || s.includes('last mile')) return { department: 'LOGISTICS_KGD', logisticsStage: 'LAST_MILE' };
  if (s.includes('администрац')) return { department: 'ADMINISTRATION', logisticsStage: null };
  if (s.includes('дирекц')) return { department: 'DIRECTION', logisticsStage: null };
  if (s.includes('продаж')) return { department: 'SALES', logisticsStage: null };
  if (s.includes('сервис')) return { department: 'SERVICE', logisticsStage: null };
  if (s === 'it' || s.includes(' айти') || s.includes('it ')) return { department: 'IT', logisticsStage: null };
  return { department: source || 'GENERAL', logisticsStage: null };
}

function getExpenseTypeLabel(type?: string | null): string {
  const t = String(type ?? '').trim().toUpperCase();
  if (t === 'COGS' || t === 'OPEX' || t === 'CAPEX') return t;
  return t || '—';
}

function getSubdivisionLabel(department?: string | null, logisticsStage?: string | null): string {
  const dep = String(department ?? '').trim().toUpperCase();
  const stage = String(logisticsStage ?? '').trim().toUpperCase();
  const depLabel = dep ? ((DEPARTMENT_LABELS as Record<string, string>)[dep] ?? dep) : '';
  const stageLabel = stage ? ((LOGISTICS_STAGE_LABELS as Record<string, string>)[stage] ?? stage) : '';
  if (depLabel && stageLabel) return `${depLabel} / ${stageLabel}`;
  return depLabel || stageLabel || '—';
}

function getLocalApprovedPaidExpenses(month: number, year: number, department: string): SavedExpense[] {
  if (typeof window === 'undefined') return [];
  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  const out: SavedExpense[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(EXPENSE_REQUESTS_STORAGE_PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const status = String(item?.status ?? '').trim().toLowerCase();
        if (status !== 'approved' && status !== 'paid') continue;
        const period = String(item?.period ?? '').trim();
        const docDate = String(item?.docDate ?? '').trim();
        const periodFromDate = /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate.slice(0, 7) : '';
        if (period !== periodKey && periodFromDate !== periodKey) continue;
        const mapped = mapDepartmentToPnl(item?.department);
        if (mapped.department !== department) continue;
        const amount = Math.abs(Number(item?.amount) || 0);
        if (!(amount > 0)) continue;
        const id = String(item?.id ?? '').trim() || `local-${key}-${i}`;
        out.push({
          id: `local-request:${id}`,
          categoryId: String(item?.categoryId ?? id),
          categoryName: String(item?.categoryName ?? item?.categoryId ?? 'Заявка на расходы'),
          amount,
          comment: String(item?.comment ?? '').trim() || null,
          direction: '',
          transportType: '',
          type: null,
          department: mapped.department,
          logisticsStage: mapped.logisticsStage,
          requestDepartment: String(item?.department ?? '').trim() || null,
          source: 'expense_request',
          requestStatus: status,
        });
      }
    }
  } catch {
    return [];
  }
  const dedup = new Map<string, SavedExpense>();
  out.forEach((x) => dedup.set(x.id || `${x.categoryId}:${x.amount}:${x.comment || ''}`, x));
  return Array.from(dedup.values());
}

interface Props { department: string; logisticsStage?: string | null; label: string; description: string; subdivisionSelect?: React.ReactNode; }

export function UploadExpenseForm({ department, logisticsStage, label, description, subdivisionSelect }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filteredCats, setFilteredCats] = useState<ExpenseCat[]>([]);
  const isMainline = logisticsStage === 'MAINLINE';
  const [rows, setRows] = useState<ExpenseRow[]>([{ id: generateId(), categoryId: '', amount: '', direction: 'MSK_TO_KGD', transportType: 'AUTO' }]);
  const [savedExpenses, setSavedExpenses] = useState<SavedExpense[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [catsLoading, setCatsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingAmount, setEditingAmount] = useState<{ key: string; value: string } | null>(null);
  const [editingComment, setEditingComment] = useState<{ key: string; value: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const rowKey = (e: SavedExpense) => e.id || `${e.categoryId}:${e.direction ?? ''}:${e.transportType ?? ''}`;

  const loadSaved = () => {
    const stage = logisticsStage == null ? '' : logisticsStage;
    pnlGet<any>('/api/manual-entry', { month: String(month), year: String(year), department, logisticsStage: stage })
      .then((d) => {
        const serverExpenses: SavedExpense[] = Array.isArray(d?.expenses) ? d.expenses : [];
        const hasRequestRows = serverExpenses.some((x) => x?.source === 'expense_request');
        const localFallback = hasRequestRows ? [] : getLocalApprovedPaidExpenses(month, year, department);
        setSavedExpenses([...serverExpenses, ...localFallback]);
      })
      .catch(() => setSavedExpenses([]))
      .finally(() => setSavedLoading(false));
  };

  useEffect(loadSaved, [month, year, department, logisticsStage]);

  useEffect(() => {
    pnlGet<ExpenseCat[]>('/api/expense-categories').then((cats) => {
      setFilteredCats(cats.filter((c) => c.department === department && (logisticsStage === null ? c.logisticsStage === null : c.logisticsStage === logisticsStage)));
      setCatsLoading(false);
    });
  }, [department, logisticsStage]);

  const updateRow = (id: string, field: keyof ExpenseRow, value: string) => { setRows((r) => r.map((row) => row.id === id ? { ...row, [field]: value } : row)); setSaveSuccess(false); };

  const handleSaveExpenses = async () => {
    const validRows = rows.filter((r) => r.categoryId && parseFloat(r.amount.replace(/\s/g, '').replace(/,/g, '.')) > 0);
    if (validRows.length === 0) return;
    setSaving(true); setSaveSuccess(false);
    try {
      const period = `${year}-${String(month).padStart(2, '0')}-01`;
      await pnlPost('/api/manual-entry', { period, revenues: [], expenses: validRows.map((r) => ({ categoryId: r.categoryId, amount: parseFloat(r.amount.replace(/\s/g, '').replace(/,/g, '.')) || 0, direction: isMainline ? r.direction : '', transportType: isMainline ? r.transportType : '' })) });
      setSaveSuccess(true); loadSaved();
    } finally { setSaving(false); }
  };

  const handleUpdateSaved = async (categoryId: string, newAmount: number, comment?: string | null, direction = '', transportType = '', requestId = '') => {
    setEditingAmount(null);
    setEditingComment(null);
    const period = `${year}-${String(month).padStart(2, '0')}-01`;
    await pnlPost('/api/manual-entry', {
      period,
      revenues: [],
      expenses: [requestId
        ? { requestId, amount: newAmount, comment: comment?.trim() || undefined }
        : { categoryId, amount: newAmount, comment: comment?.trim() || undefined, direction, transportType }],
    });
    loadSaved();
  };

  const updateLocalRequest = (localRequestId: string, updater: (item: any) => any | null) => {
    if (typeof window === 'undefined') return false;
    let updated = false;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(EXPENSE_REQUESTS_STORAGE_PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) continue;
        const next = list
          .map((item) => {
            const id = String(item?.id ?? '').trim();
            if (id !== localRequestId) return item;
            updated = true;
            return updater(item);
          })
          .filter((x) => x != null);
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore broken localStorage rows
      }
    }
    return updated;
  };

  const handleDeleteSaved = async (categoryId: string, direction = '', transportType = '', requestId = '', localRequestId = '', rowIdentity = '') => {
    if (!confirm('Удалить эту запись?')) return;
    setDeletingId(rowIdentity || (requestId ? `request:${requestId}` : localRequestId ? `local-request:${localRequestId}` : `manual:${categoryId}:${direction}:${transportType}`));
    if (localRequestId) {
      updateLocalRequest(localRequestId, () => null);
      setDeletingId(null);
      loadSaved();
      return;
    }
    const period = `${year}-${String(month).padStart(2, '0')}-01`;
    await pnlPost('/api/manual-entry', {
      period,
      revenues: [],
      expenses: [requestId
        ? { requestId, deleteRequest: true }
        : { categoryId, amount: 0, direction, transportType }],
    });
    setDeletingId(null); loadSaved();
  };

  const handleUpdateLocalRequest = (localRequestId: string, amount: number, comment: string) => {
    const changed = updateLocalRequest(localRequestId, (item) => ({ ...item, amount, comment }));
    if (changed) loadSaved();
  };

  const totalExpenses = rows.reduce((s, r) => s + (parseFloat(r.amount.replace(/\s/g, '').replace(/,/g, '.')) || 0), 0);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">{label}</h1><p className="text-slate-500">{description}</p></div>
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Ввод затрат</h2>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {subdivisionSelect}
          <div className="flex gap-2">
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{[year - 2, year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </div>
        </div>
        {catsLoading ? <div className="animate-pulse text-slate-500">Загрузка справочника...</div> : filteredCats.length === 0 ? <p className="text-slate-500 text-sm">Нет статей расходов для этого подразделения.</p> : (
          <>
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2">
                  <select value={row.categoryId} onChange={(e) => updateRow(row.id, 'categoryId', e.target.value)} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-900" style={{ minWidth: 140 }}>
                    <option value="">— Выберите статью —</option>
                    {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {isMainline && (
                    <>
                      <select value={row.direction} onChange={(e) => updateRow(row.id, 'direction', e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900" style={{ width: 130 }}>{MAINLINE_DIRECTIONS.map((d) => <option key={d} value={d}>{(DIRECTION_LABELS as Record<string, string>)[d]}</option>)}</select>
                      <select value={row.transportType} onChange={(e) => updateRow(row.id, 'transportType', e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900" style={{ width: 90 }}>{MAINLINE_TRANSPORT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                    </>
                  )}
                  <input type="text" value={row.amount} onChange={(e) => updateRow(row.id, 'amount', e.target.value)} placeholder="Сумма" className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900 text-right" style={{ width: 112 }} />
                  {rows.length > 1 && <button onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))} className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
            </div>
            <button onClick={() => setRows((r) => [...r, { id: generateId(), categoryId: '', amount: '', direction: 'MSK_TO_KGD', transportType: 'AUTO' }])} className="mt-3 text-sm flex items-center gap-1" style={{ color: '#2563eb' }}><Plus className="w-4 h-4" /> Добавить строку</button>
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <span className="font-medium">Итого: {formatRub(totalExpenses)}</span>
              <button onClick={handleSaveExpenses} disabled={saving || rows.every((r) => !r.categoryId || !r.amount)} className="px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2" style={{ background: '#2563eb' }}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
            </div>
            {saveSuccess && <div className="mt-3 p-3 bg-emerald-50 rounded-lg flex items-center gap-2" style={{ color: '#047857' }}><CheckCircle className="w-5 h-5" /><span>Сохранено</span></div>}
          </>
        )}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h2 className="text-lg font-semibold text-slate-900 px-6 py-4 border-b border-slate-100">Сохранённые затраты ({MONTHS[month - 1]} {year})</h2>
        {savedLoading ? <div className="px-6 py-6 text-slate-500 animate-pulse">Загрузка...</div> : savedExpenses.length === 0 ? <div className="px-6 py-6 text-slate-500 text-sm">Нет сохранённых затрат за этот период.</div> : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr className="border-b border-slate-100 bg-slate-50"><th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Статья</th><th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Подразделение</th><th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Тип</th>{isMainline && <th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Направление</th>}<th className="px-6 py-2 text-right text-sm font-medium text-slate-600">Сумма</th><th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Комментарий</th><th className="px-6 py-2 text-right text-sm font-medium text-slate-600">Действия</th></tr></thead>
                <tbody>
                  {savedExpenses.map((e) => {
                    const key = rowKey(e);
                    const isRequestExpense = e.source === 'expense_request';
                    const isManualExpense = !e.source || e.source === 'manual';
                    const requestId = isRequestExpense && key.startsWith('request:') ? key.slice('request:'.length) : '';
                    const localRequestId = isRequestExpense && key.startsWith('local-request:') ? key.slice('local-request:'.length) : '';
                    const canEditRequest = isRequestExpense && (Boolean(requestId) || Boolean(localRequestId));
                    const canEditRow = isManualExpense || canEditRequest;
                    const isEA = editingAmount?.key === key;
                    const isEC = editingComment?.key === key;
                    const dir = e.direction ?? ''; const transport = e.transportType ?? '';
                    const cat = filteredCats.find((c) => c.id === e.categoryId || normalizeName(c.name) === normalizeName(e.categoryName));
                    const departmentValue = e.department ?? cat?.department ?? department;
                    const logisticsStageValue = e.logisticsStage ?? cat?.logisticsStage ?? logisticsStage ?? null;
                    const typeValue = e.type ?? cat?.type ?? 'OPEX';
                    const subdivisionLabel = isRequestExpense
                      ? (String(e.requestDepartment ?? '').trim() || getSubdivisionLabel(departmentValue, logisticsStageValue))
                      : getSubdivisionLabel(departmentValue, logisticsStageValue);
                    return (
                      <tr key={key} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-6 py-2 text-slate-900">{e.categoryName}</td>
                        <td className="px-6 py-2 text-slate-600 text-sm">{subdivisionLabel}</td>
                        <td className="px-6 py-2 text-slate-600 text-sm">{getExpenseTypeLabel(typeValue)}</td>
                        {isMainline && <td className="px-6 py-2 text-slate-600 text-sm">{dir && transport ? `${(DIRECTION_LABELS as Record<string, string>)[dir] ?? dir} ${transport === 'FERRY' ? 'паром' : 'авто'}` : '—'}</td>}
                        <td className="px-6 py-2 text-right">
                          {canEditRow ? (
                            <input type="number" step="0.01" min="0" value={isEA ? editingAmount.value : String(e.amount)} onChange={(ev) => setEditingAmount({ key, value: ev.target.value })} onFocus={() => setEditingAmount({ key, value: String(e.amount) })} className="w-28 text-right border border-slate-200 rounded px-2 py-1 text-slate-900 font-medium" />
                          ) : (
                            <span className="text-slate-900 font-medium">{formatRub(e.amount)}</span>
                          )}
                        </td>
                        <td className="px-6 py-2">
                          {canEditRow ? (
                            <input type="text" value={isEC ? editingComment.value : (e.comment ?? '')} onChange={(ev) => setEditingComment({ key, value: ev.target.value })} onFocus={() => setEditingComment({ key, value: e.comment ?? '' })} placeholder="Комментарий" className="w-full border border-slate-200 rounded px-2 py-1 text-sm text-slate-700" style={{ minWidth: 180 }} />
                          ) : (
                            <span className="text-sm text-slate-700">
                              {(e.comment ?? '').trim() || `Из заявки (${e.requestStatus === 'paid' ? 'Оплачено' : 'Согласовано'})`}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-2 text-right">
                          {canEditRow ? (
                            <div className="inline-flex items-center gap-2 whitespace-nowrap">
                              <button
                                onClick={() => {
                                  const amountValue = isEA ? parseFloat(editingAmount.value) : e.amount;
                                  if (!Number.isFinite(amountValue) || amountValue < 0) return;
                                  const commentValue = isEC ? editingComment.value : (e.comment ?? '');
                                  if (localRequestId) {
                                    handleUpdateLocalRequest(localRequestId, amountValue, commentValue);
                                    setEditingAmount(null);
                                    setEditingComment(null);
                                    return;
                                  }
                                  handleUpdateSaved(e.categoryId, amountValue, commentValue, dir, transport, requestId);
                                }}
                                className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                              >
                                Изменить
                              </button>
                              <button
                                onClick={() => handleDeleteSaved(e.categoryId, dir, transport, requestId, localRequestId, key)}
                                disabled={deletingId === key}
                                className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Удалить
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-2 bg-slate-50 border-t border-slate-100 flex justify-end"><span className="font-semibold text-slate-900">Итого: {formatRub(savedExpenses.reduce((s, e) => s + e.amount, 0))}</span></div>
          </>
        )}
      </div>
    </div>
  );
}
