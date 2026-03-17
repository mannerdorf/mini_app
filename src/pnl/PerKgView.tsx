import { useEffect, useState } from 'react';
import { Filters, defaultFiltersState, filtersToParams } from './Filters';
import { pnlGet } from './api';
import { LOGISTICS_STAGE_LABELS, DEPARTMENT_LABELS } from './constants';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽/кг';
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-sm text-slate-500 mb-1">{title}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function PerKgView() {
  const [filters, setFilters] = useState(defaultFiltersState);
  const [unitEcon, setUnitEcon] = useState<any>(null);
  const [monthlyMargin, setMonthlyMargin] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const updateFilter = (key: string, value: string | number) => setFilters((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    setError(null);
    setLoading(true);
    const params = filtersToParams(filters);
    Promise.all([
      pnlGet('/api/unit-economics', params),
      pnlGet<any[]>('/api/charts/monthly-margin', params),
    ])
      .then(([ue, margin]) => {
        setUnitEcon(ue?.error ? null : ue);
        setMonthlyMargin(Array.isArray(margin) ? margin : []);
        if (ue?.error) setError(ue.error);
      })
      .catch((err) => {
        setUnitEcon(null);
        setMonthlyMargin([]);
        setError(err?.message ?? 'Ошибка загрузки данных');
      })
      .finally(() => setLoading(false));
  }, [filters.dateFrom, filters.dateTo, filters.direction, filters.transportType]);

  if (error && !unitEcon) return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Дашборд «1 кг логистики»</h1><p className="text-slate-500">KPI и графики в пересчёте на 1 кг</p></div>
      <Filters {...filters} onChange={updateFilter} />
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">{error}</div>
    </div>
  );
  if (loading) return <div className="animate-pulse">Загрузка...</div>;
  if (!unitEcon) return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Дашборд «1 кг логистики»</h1><p className="text-slate-500">KPI и графики в пересчёте на 1 кг</p></div>
      <Filters {...filters} onChange={updateFilter} />
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800">Нет данных о весе. Загрузите продажи с полем веса (кг), чтобы рассчитать метрики на 1 кг.</div>
    </div>
  );

  const stageOrder = ['PICKUP', 'DEPARTURE_WAREHOUSE', 'MAINLINE', 'ARRIVAL_WAREHOUSE', 'LAST_MILE'];
  const stageData = stageOrder.filter((s) => (unitEcon.cogsByStagePerKg?.[s] ?? 0) > 0)
    .map((s) => ({ name: (LOGISTICS_STAGE_LABELS as Record<string, string>)[s], value: unitEcon.cogsByStagePerKg[s] ?? 0 }));
  const deptData = Object.entries(unitEcon.cogsByDeptPerKg ?? {}).filter(([, v]: any) => v > 0)
    .map(([k, v]: any) => ({ name: (DEPARTMENT_LABELS as Record<string, string>)[k] ?? k, value: v }));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Дашборд «1 кг логистики»</h1><p className="text-slate-500">KPI и графики в пересчёте на 1 кг</p></div>
      <Filters {...filters} onChange={updateFilter} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Доход / кг" value={formatRub(unitEcon.revenuePerKg)} />
        <KpiCard title="COGS / кг" value={formatRub(unitEcon.cogsPerKg)} />
        <KpiCard title="EBITDA / кг" value={formatRub(unitEcon.ebitdaPerKg)} />
        <KpiCard title="Маржа / кг" value={formatRub(unitEcon.marginPerKg)} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Себестоимость 1 кг по этапам</h2>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => `${v} ₽`} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatRub(v)} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Москва vs КГД (COGS/кг)</h2>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${v} ₽`} />
                <Tooltip formatter={(v: number) => formatRub(v)} />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      {monthlyMargin.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Маржа / кг по месяцам</h2>
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `${v} ₽`} />
                <Tooltip formatter={(v: number) => formatRub(v)} />
                <Line type="monotone" dataKey="marginPerKg" stroke="#3b82f6" strokeWidth={2} name="Маржа/кг" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
