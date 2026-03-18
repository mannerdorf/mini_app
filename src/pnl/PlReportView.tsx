import { useEffect, useState } from 'react';
import { Filters, defaultFiltersState, filtersToParams } from './Filters';
import { pnlGet } from './api';
import { DEPARTMENT_LABELS, DIRECTION_LABELS } from './constants';

function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽';
}

export function PlReportView() {
  const [filters, setFilters] = useState(defaultFiltersState);
  const [data, setData] = useState<any>(null);
  const [unitEcon, setUnitEcon] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const updateFilter = (key: string, value: string | number) => setFilters((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    setError(null);
    setLoading(true);
    const params = filtersToParams(filters);
    Promise.all([
      pnlGet('/api/pnl', params),
      pnlGet('/api/unit-economics', params),
    ])
      .then(([d, u]: any[]) => {
        setData(d?.error ? null : d);
        setUnitEcon(u?.error ? null : u);
        if (d?.error) setError(d.error);
      })
      .catch((err) => { setData(null); setError(err?.message ?? 'Ошибка загрузки данных'); })
      .finally(() => setLoading(false));
  }, [filters.dateFrom, filters.dateTo, filters.direction, filters.transportType]);

  if (error && !data) return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">P&L отчёт</h1><p className="text-slate-500">Структурированный отчёт о прибылях и убытках</p></div>
      <Filters {...filters} onChange={updateFilter} />
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">{error}</div>
    </div>
  );
  if (loading) return <div className="animate-pulse">Загрузка...</div>;
  if (!data) return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">P&L отчёт</h1><p className="text-slate-500">Структурированный отчёт о прибылях и убытках</p></div>
      <Filters {...filters} onChange={updateFilter} />
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">Нет данных для построения отчёта за выбранный период.</div>
    </div>
  );

  const { pnl, opexByDept, opexByCategory, revenueByDir } = data;
  const cogsByDeptPerKgRows = Object.entries(unitEcon?.cogsByDeptPerKg ?? {})
    .map(([dept, value]) => ({ dept, value: Number(value) || 0 }))
    .sort((a, b) => b.value - a.value);
  const effectiveOpexRows = Array.isArray(opexByCategory) && opexByCategory.length > 0
    ? opexByCategory.map((o: any) => ({ label: o.category, amount: Number(o.amount) || 0 }))
    : (opexByDept ?? []).map((o: any) => ({ label: (DEPARTMENT_LABELS as Record<string, string>)[o.dept] ?? o.dept, amount: Number(o.amount) || 0 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">P&L отчёт</h1>
        <p className="text-slate-500">Структурированный отчёт о прибылях и убытках</p>
      </div>
      <Filters {...filters} onChange={updateFilter} />
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="divide-y divide-slate-100">
          <section className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">1. Выручка</h2>
            <div className="space-y-2 pl-4">
              {(revenueByDir ?? []).map((r: any) => (
                <div key={r.direction} className="flex justify-between">
                  <span>{r.label ?? (DIRECTION_LABELS as Record<string, string>)[r.direction] ?? r.direction}</span>
                  <span>{formatRub(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold pt-2 border-t"><span>Итого</span><span>{formatRub(pnl.revenue)}</span></div>
            </div>
          </section>
          <section className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">2. Затраты 1 кг по подразделениям</h2>
            {unitEcon && cogsByDeptPerKgRows.length > 0 ? (
              <div className="space-y-2 pl-4">
                {cogsByDeptPerKgRows.map((r: { dept: string; value: number }) => (
                  <div key={r.dept} className="flex justify-between">
                    <span>{(DEPARTMENT_LABELS as Record<string, string>)[r.dept] ?? r.dept}</span>
                    <span>{formatRub(r.value)}/кг</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Итого COGS / кг</span>
                  <span>{formatRub(Number(unitEcon.cogsPerKg) || 0)}/кг</span>
                </div>
              </div>
            ) : (
              <div className="pl-4 text-slate-500">Нет данных о весе за выбранный период.</div>
            )}
          </section>
          <section className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">3. Валовая прибыль</h2>
            <div className="pl-4"><span className="font-semibold">{formatRub(pnl.grossProfit)}</span></div>
          </section>
          <section className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">4. OPEX (статьи расходов периода)</h2>
            <div className="space-y-2 pl-4">
              {effectiveOpexRows.map((o: { label: string; amount: number }) => (
                <div key={o.label} className="flex justify-between">
                  <span>{o.label}</span>
                  <span>{formatRub(o.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold pt-2 border-t"><span>Итого OPEX</span><span>{formatRub(pnl.opex)}</span></div>
            </div>
          </section>
          <section className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">5. EBITDA</h2>
            <div className="pl-4"><span className="font-semibold" style={{ color: '#10b981' }}>{formatRub(pnl.ebitda)}</span></div>
          </section>
          <section className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">6. CAPEX</h2>
            <div className="pl-4"><span className="font-semibold">{formatRub(pnl.capex ?? 0)}</span></div>
          </section>
          <section className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">7. Валовая прибыль – OPEX – CAPEX</h2>
            <div className="pl-4"><span className="font-semibold">{formatRub(pnl.netAfterCapex ?? 0)}</span></div>
          </section>
          <section className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">8. Ниже EBITDA</h2>
            <div className="space-y-2 pl-4">
              <div className="flex justify-between"><span>Дивиденды</span><span>—</span></div>
              <div className="flex justify-between"><span>Кредиты и лизинг</span><span>{formatRub(pnl.creditPayments ?? 0)}</span></div>
              <div className="flex justify-between"><span>Транзит</span><span>—</span></div>
              <div className="flex justify-between font-semibold pt-2 border-t"><span>Итого</span><span>{formatRub(pnl.belowEbitda)}</span></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
