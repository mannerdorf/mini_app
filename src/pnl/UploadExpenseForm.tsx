import { useState, useEffect, useMemo } from 'react';
import { pnlGet, pnlPost } from './api';
import { DEPARTMENT_LABELS, DIRECTION_LABELS, MONTHS } from './constants';
import { CheckCircle, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';

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
  docNumber?: string | null;
  docDate?: string | null;
  period?: string | null;
  vatRate?: string | null;
  employeeName?: string | null;
  vehicleText?: string | null;
  supplierName?: string | null;
  supplierInn?: string | null;
}
interface SubdivisionDirectoryRow {
  id: string;
  name: string;
  department: string;
  logisticsStage: string | null;
}
interface TimesheetRowOverride {
  amount?: number;
  comment?: string | null;
  hidden?: boolean;
}

function formatRub(n: number) { return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽'; }
function generateId() { return Math.random().toString(36).slice(2, 9); }
const EXPENSE_REQUESTS_STORAGE_PREFIX = 'haulz.expense_requests.';
const TIMESHEET_OVERRIDES_STORAGE_PREFIX = 'haulz.timesheet_saved_overrides.';
function normalizeName(v?: string | null) { return String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '); }

function mapDepartmentToPnl(raw?: string | null): { department: string; logisticsStage: string | null } {
  const source = String(raw ?? '').trim();
  const upper = source.toUpperCase();
  const known = new Set(['LOGISTICS_MSK', 'LOGISTICS_KGD', 'ADMINISTRATION', 'DIRECTION', 'IT', 'SALES', 'SERVICE', 'GENERAL']);
  if (known.has(upper)) return { department: upper, logisticsStage: null };
  const s = source.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  if (s.includes('забор')) return { department: 'LOGISTICS_MSK', logisticsStage: 'PICKUP' };
  const hasMsk = s.includes('москва') || s.includes('мск');
  const hasKgd = s.includes('калининград') || s.includes('кгд');
  if (s.includes('склад') && hasMsk && !hasKgd) return { department: 'LOGISTICS_MSK', logisticsStage: 'DEPARTURE_WAREHOUSE' };
  if (s.includes('склад отправления')) return { department: 'LOGISTICS_MSK', logisticsStage: 'DEPARTURE_WAREHOUSE' };
  if (s.includes('магистрал')) return { department: 'LOGISTICS_MSK', logisticsStage: 'MAINLINE' };
  if (s.includes('склад') && hasKgd) return { department: 'LOGISTICS_KGD', logisticsStage: 'ARRIVAL_WAREHOUSE' };
  if (s.includes('склад получения')) return { department: 'LOGISTICS_KGD', logisticsStage: 'ARRIVAL_WAREHOUSE' };
  if (s.includes('последняя миля') || s.includes('last mile') || (s.includes('миля') && hasKgd)) return { department: 'LOGISTICS_KGD', logisticsStage: 'LAST_MILE' };
  if (s.includes('администрац') || s.includes('управляющ')) return { department: 'ADMINISTRATION', logisticsStage: null };
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

function buildRequestAnalyticsDisplay(e: SavedExpense): string {
  const parts: string[] = [];
  if (e.docNumber?.trim()) parts.push(`№${e.docNumber.trim()}`);
  if (e.docDate?.trim()) parts.push(`от ${e.docDate.trim()}`);
  if (e.supplierName?.trim()) parts.push(e.supplierInn?.trim() ? `${e.supplierName.trim()} (${e.supplierInn.trim()})` : e.supplierName.trim());
  if (e.employeeName?.trim()) parts.push(e.employeeName.trim());
  if (e.vehicleText?.trim()) parts.push(`ТС: ${e.vehicleText.trim()}`);
  if (e.vatRate?.trim()) parts.push(`НДС ${e.vatRate}%`);
  const base = parts.length ? parts.join(' • ') : '';
  const comment = (e.comment ?? '').trim();
  const status = e.source === 'expense_request' && e.requestStatus ? `(${e.requestStatus === 'paid' ? 'Оплачено' : 'Согласовано'})` : '';
  const main = comment ? (base ? `${base}. ${comment}` : comment) : (base || '');
  return main ? (status ? `${main} ${status}` : main) : status || '—';
}

function getSubdivisionKey(department?: string | null, logisticsStage?: string | null): string {
  return `${String(department ?? '').trim().toUpperCase()}::${String(logisticsStage ?? '').trim().toUpperCase()}`;
}

function getTimesheetOverrideStorageKey(month: number, year: number): string {
  return `${TIMESHEET_OVERRIDES_STORAGE_PREFIX}${year}-${String(month).padStart(2, '0')}`;
}

function getLocalApprovedPaidExpenses(month: number, year: number, department?: string | null): SavedExpense[] {
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
        if (department && mapped.department !== department) continue;
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
          docNumber: String(item?.docNumber ?? '').trim() || null,
          docDate: String(item?.docDate ?? '').trim().slice(0, 10) || null,
          period: String(item?.period ?? '').trim() || null,
          vatRate: String(item?.vatRate ?? '').trim() || null,
          employeeName: String(item?.employeeName ?? '').trim() || null,
          vehicleText: String(item?.vehicleOrEmployee ?? item?.vehicleText ?? '').trim() || null,
          supplierName: String(item?.supplierName ?? '').trim() || null,
          supplierInn: String(item?.supplierInn ?? '').trim() || null,
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
  const [inputExpanded, setInputExpanded] = useState(false);
  const [filteredCats, setFilteredCats] = useState<ExpenseCat[]>([]);
  const isMainline = logisticsStage === 'MAINLINE';
  const [rows, setRows] = useState<ExpenseRow[]>([{ id: generateId(), categoryId: '', amount: '', direction: 'MSK_TO_KGD', transportType: 'AUTO' }]);
  const [savedExpensesAll, setSavedExpensesAll] = useState<SavedExpense[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [catsLoading, setCatsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState<string>('');
  const [editingComment, setEditingComment] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savedFilterMonth, setSavedFilterMonth] = useState(now.getMonth() + 1);
  const [savedFilterYear, setSavedFilterYear] = useState(now.getFullYear());
  const [savedFilterDepartment, setSavedFilterDepartment] = useState('ALL');
  const [savedFilterType, setSavedFilterType] = useState('ALL');
  const [subdivisionDirectory, setSubdivisionDirectory] = useState<SubdivisionDirectoryRow[]>([]);
  const [timesheetOverrides, setTimesheetOverrides] = useState<Record<string, TimesheetRowOverride>>({});

  const rowKey = (e: SavedExpense) => e.id || `${e.categoryId}:${e.direction ?? ''}:${e.transportType ?? ''}`;

  const loadSaved = () => {
    setSavedLoading(true);
    pnlGet<any>('/api/manual-entry', { month: String(savedFilterMonth), year: String(savedFilterYear) })
      .then((d) => {
        const serverExpenses: SavedExpense[] = Array.isArray(d?.expenses) ? d.expenses : [];
        const hasRequestRows = serverExpenses.some((x) => x?.source === 'expense_request');
        const localFallback = hasRequestRows ? [] : getLocalApprovedPaidExpenses(savedFilterMonth, savedFilterYear);
        setSavedExpensesAll([...serverExpenses, ...localFallback]);
      })
      .catch(() => setSavedExpensesAll([]))
      .finally(() => setSavedLoading(false));
  };

  useEffect(loadSaved, [savedFilterMonth, savedFilterYear]);

  useEffect(() => {
    pnlGet<ExpenseCat[]>('/api/expense-categories').then((cats) => {
      setFilteredCats(cats.filter((c) => c.department === department && (logisticsStage === null ? c.logisticsStage === null : c.logisticsStage === logisticsStage)));
      setCatsLoading(false);
    });
  }, [department, logisticsStage]);
  useEffect(() => {
    pnlGet<SubdivisionDirectoryRow[]>('/api/subdivisions')
      .then((data) => setSubdivisionDirectory(Array.isArray(data) ? data : []))
      .catch(() => setSubdivisionDirectory([]));
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(getTimesheetOverrideStorageKey(savedFilterMonth, savedFilterYear));
      const parsed = raw ? JSON.parse(raw) : {};
      setTimesheetOverrides(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setTimesheetOverrides({});
    }
  }, [savedFilterMonth, savedFilterYear]);

  const saveTimesheetOverride = (rowId: string, patch: TimesheetRowOverride) => {
    if (typeof window === 'undefined') return;
    setTimesheetOverrides((prev) => {
      const next = { ...prev, [rowId]: { ...(prev[rowId] || {}), ...patch } };
      try {
        window.localStorage.setItem(getTimesheetOverrideStorageKey(savedFilterMonth, savedFilterYear), JSON.stringify(next));
      } catch {
        // ignore storage write failures
      }
      return next;
    });
  };

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
    setEditingRowKey(null);
    const period = `${savedFilterYear}-${String(savedFilterMonth).padStart(2, '0')}-01`;
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
    const period = `${savedFilterYear}-${String(savedFilterMonth).padStart(2, '0')}-01`;
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
  const subdivisionLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    subdivisionDirectory.forEach((s) => {
      m.set(getSubdivisionKey(s.department, s.logisticsStage), String(s.name || '').trim());
    });
    return m;
  }, [subdivisionDirectory]);
  const getSubdivisionDirectoryLabel = (departmentValue?: string | null, logisticsStageValue?: string | null) => {
    const key = getSubdivisionKey(departmentValue, logisticsStageValue);
    const fromDir = subdivisionLabelByKey.get(key);
    if (fromDir) return fromDir;
    const dept = String(departmentValue ?? '').trim().toUpperCase();
    if (dept) {
      const fallback = dept === 'SALES' ? 'Отдел продаж' : (DEPARTMENT_LABELS as Record<string, string>)[dept];
      if (fallback) return fallback;
    }
    return '—';
  };
  const savedDepartmentOptions = useMemo(() => {
    const set = new Set<string>();
    savedExpensesAll.forEach((e) => {
      const dep = getSubdivisionDirectoryLabel(e.department, e.logisticsStage);
      if (dep && dep !== '—') set.add(dep);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [savedExpensesAll, subdivisionLabelByKey]);
  const savedTypeOptions = useMemo(() => {
    const set = new Set<string>();
    savedExpensesAll.forEach((e) => set.add(getExpenseTypeLabel(e.type)));
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [savedExpensesAll]);
  const savedExpenses = useMemo(() => {
    const prepared = savedExpensesAll
      .map((e) => {
        if (e.source !== 'timesheet_salary' || !e.id) return e;
        const override = timesheetOverrides[e.id];
        if (!override) return e;
        if (override.hidden) return null;
        return {
          ...e,
          amount: override.amount != null && Number.isFinite(Number(override.amount)) ? Number(override.amount) : e.amount,
          comment: override.comment != null ? override.comment : e.comment,
        };
      })
      .filter((x): x is SavedExpense => x != null);
    return prepared.filter((e) => {
      const depLabel = getSubdivisionDirectoryLabel(e.department, e.logisticsStage);
      const typeLabel = getExpenseTypeLabel(e.type);
      if (savedFilterDepartment !== 'ALL' && depLabel !== savedFilterDepartment) return false;
      if (savedFilterType !== 'ALL' && typeLabel !== savedFilterType) return false;
      return true;
    });
  }, [savedExpensesAll, savedFilterDepartment, savedFilterType, subdivisionLabelByKey, timesheetOverrides]);
  const savedTotal = savedExpenses.reduce((s, e) => s + Math.round(Number(e.amount) || 0), 0);

  return (
    <div className="space-y-6" style={{ color: 'var(--color-text, #0f172a)' }}>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text, #0f172a)' }}>{label}</h1>
        <p style={{ color: 'var(--color-text-secondary, #64748b)' }}>{description}</p>
      </div>
      <div className="rounded-xl p-8 shadow-sm" style={{ background: 'var(--color-bg-card, #fff)', border: '1px solid var(--color-border, #e2e8f0)' }}>
        <button
          type="button"
          onClick={() => setInputExpanded((v) => !v)}
          className="w-full flex items-center justify-between"
          style={{ marginBottom: inputExpanded ? '1rem' : 0 }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text, #0f172a)' }}>Ввод затрат</h2>
          {inputExpanded ? <ChevronDown className="w-5 h-5" style={{ color: 'var(--color-text-secondary, #64748b)' }} /> : <ChevronRight className="w-5 h-5" style={{ color: 'var(--color-text-secondary, #64748b)' }} />}
        </button>
        {inputExpanded ? (
          <>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              {subdivisionSelect}
              <div className="flex gap-2">
                <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
                <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">{[year - 2, year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}</select>
              </div>
            </div>
            {catsLoading ? <div className="animate-pulse" style={{ color: 'var(--color-text-secondary, #64748b)' }}>Загрузка справочника...</div> : filteredCats.length === 0 ? <p className="text-sm" style={{ color: 'var(--color-text-secondary, #64748b)' }}>Нет статей расходов для этого подразделения.</p> : (
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
          </>
        ) : null}
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg-card, #fff)', border: '1px solid var(--color-border, #e2e8f0)' }}>
        <h2 className="text-lg font-semibold px-6 py-4" style={{ color: 'var(--color-text, #0f172a)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>Сохранённые затраты ({MONTHS[savedFilterMonth - 1]} {savedFilterYear})</h2>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)', background: 'var(--color-bg-hover, #f8fafc)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <select value={savedFilterMonth} onChange={(e) => setSavedFilterMonth(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">
              {MONTHS.map((m, i) => <option key={`saved-month-${i}`} value={i + 1}>{m}</option>)}
            </select>
            <select value={savedFilterYear} onChange={(e) => setSavedFilterYear(parseInt(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900">
              {[year - 2, year - 1, year, year + 1].map((y) => <option key={`saved-year-${y}`} value={y}>{y}</option>)}
            </select>
            <select value={savedFilterDepartment} onChange={(e) => setSavedFilterDepartment(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900" style={{ minWidth: 280 }}>
              <option value="ALL">Все подразделения</option>
              {savedDepartmentOptions.map((opt) => <option key={`saved-dep-${opt}`} value={opt}>{opt}</option>)}
            </select>
            <select value={savedFilterType} onChange={(e) => setSavedFilterType(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900" style={{ minWidth: 140 }}>
              <option value="ALL">Все типы</option>
              {savedTypeOptions.map((opt) => <option key={`saved-type-${opt}`} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="mt-3 text-sm font-medium" style={{ color: 'var(--color-text-secondary, #475569)' }}>
            Сумма по фильтрам: {formatRub(savedTotal)}
          </div>
        </div>
        {savedLoading ? <div className="px-6 py-6 animate-pulse" style={{ color: 'var(--color-text-secondary, #64748b)' }}>Загрузка...</div> : savedExpenses.length === 0 ? <div className="px-6 py-6 text-sm" style={{ color: 'var(--color-text-secondary, #64748b)' }}>Нет сохранённых затрат за этот период.</div> : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr className="border-b border-slate-100 bg-slate-50"><th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Статья</th><th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Подразделение</th><th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Тип</th>{isMainline && <th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Направление</th>}<th className="px-6 py-2 text-right text-sm font-medium text-slate-600">Сумма</th><th className="px-6 py-2 text-left text-sm font-medium text-slate-600">Комментарий</th><th className="px-6 py-2 text-right text-sm font-medium text-slate-600">Действия</th></tr></thead>
                <tbody>
                  {savedExpenses.map((e) => {
                    const key = rowKey(e);
                    const isRequestExpense = e.source === 'expense_request';
                    const isManualExpense = !e.source || e.source === 'manual';
                    const isTimesheetSalary = e.source === 'timesheet_salary';
                    const requestId = isRequestExpense && key.startsWith('request:') ? key.slice('request:'.length) : '';
                    const localRequestId = isRequestExpense && key.startsWith('local-request:') ? key.slice('local-request:'.length) : '';
                    const canEditRequest = isRequestExpense && (Boolean(requestId) || Boolean(localRequestId));
                    const canEditRow = isManualExpense || canEditRequest || isTimesheetSalary;
                    const isEditingRow = editingRowKey === key;
                    const dir = e.direction ?? ''; const transport = e.transportType ?? '';
                    const cat = filteredCats.find((c) => c.id === e.categoryId || normalizeName(c.name) === normalizeName(e.categoryName));
                    const departmentValue = e.department ?? cat?.department ?? department;
                    const logisticsStageValue = e.logisticsStage ?? cat?.logisticsStage ?? logisticsStage ?? null;
                    const typeValue = e.type ?? cat?.type ?? 'OPEX';
                    const subdivisionLabel = getSubdivisionDirectoryLabel(departmentValue, logisticsStageValue);
                    return (
                      <tr key={key} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-6 py-2 text-slate-900">{e.categoryName}</td>
                        <td className="px-6 py-2 text-slate-600 text-sm">{subdivisionLabel}</td>
                        <td className="px-6 py-2 text-slate-600 text-sm">{getExpenseTypeLabel(typeValue)}</td>
                        {isMainline && <td className="px-6 py-2 text-slate-600 text-sm">{dir && transport ? `${(DIRECTION_LABELS as Record<string, string>)[dir] ?? dir} ${transport === 'FERRY' ? 'паром' : 'авто'}` : '—'}</td>}
                        <td className="px-6 py-2 text-right">
                          {canEditRow && isEditingRow ? (
                            <input type="number" step="1" min="0" value={editingAmount} onChange={(ev) => setEditingAmount(ev.target.value)} className="w-28 text-right border border-slate-200 rounded px-2 py-1 text-slate-900 font-medium" />
                          ) : (
                            <span className="text-slate-900 font-medium">{formatRub(Math.round(Number(e.amount) || 0))}</span>
                          )}
                        </td>
                        <td className="px-6 py-2">
                          {canEditRow && isEditingRow ? (
                            <input type="text" value={editingComment} onChange={(ev) => setEditingComment(ev.target.value)} placeholder="Комментарий" className="w-full border border-slate-200 rounded px-2 py-1 text-sm text-slate-700" style={{ minWidth: 180 }} />
                          ) : (
                            <span className="text-sm text-slate-700" title={isRequestExpense ? buildRequestAnalyticsDisplay(e) : undefined}>
                              {isRequestExpense ? buildRequestAnalyticsDisplay(e) : ((e.comment ?? '').trim() || '—')}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-2 text-right">
                          {canEditRow ? (
                            <div className="inline-flex items-center gap-2 whitespace-nowrap">
                              {isEditingRow ? (
                                <>
                                  <button
                                    onClick={() => {
                                      const amountValue = Math.round(parseFloat(editingAmount) || 0);
                                      if (amountValue < 0) return;
                                      if (isTimesheetSalary && e.id) {
                                        saveTimesheetOverride(e.id, { amount: amountValue, comment: editingComment });
                                        setEditingRowKey(null);
                                        return;
                                      }
                                      if (localRequestId) {
                                        handleUpdateLocalRequest(localRequestId, amountValue, editingComment);
                                        setEditingRowKey(null);
                                        return;
                                      }
                                      handleUpdateSaved(e.categoryId, amountValue, editingComment, dir, transport, requestId);
                                      setEditingRowKey(null);
                                    }}
                                    className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                                  >
                                    Сохранить
                                  </button>
                                  <button
                                    onClick={() => setEditingRowKey(null)}
                                    className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                                  >
                                    Отмена
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingRowKey(key);
                                      setEditingAmount(String(Math.round(Number(e.amount) || 0)));
                                      setEditingComment((e.comment ?? '').trim());
                                    }}
                                    className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                                  >
                                    Изменить
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (isTimesheetSalary && e.id) {
                                        const confirmed = typeof window !== 'undefined' ? window.confirm('Скрыть эту запись из сохранённых затрат за выбранный период?') : true;
                                        if (!confirmed) return;
                                        saveTimesheetOverride(e.id, { hidden: true });
                                        return;
                                      }
                                      handleDeleteSaved(e.categoryId, dir, transport, requestId, localRequestId, key);
                                    }}
                                    disabled={deletingId === key}
                                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    Удалить
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-2 flex justify-end" style={{ background: 'var(--color-bg-hover, #f8fafc)', borderTop: '1px solid var(--color-border, #e2e8f0)' }}><span className="font-semibold" style={{ color: 'var(--color-text, #0f172a)' }}>Итого: {formatRub(savedExpenses.reduce((s, e) => s + Math.round(Number(e.amount) || 0), 0))}</span></div>
          </>
        )}
      </div>
    </div>
  );
}
