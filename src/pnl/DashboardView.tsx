import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart,
} from 'recharts';
import { Filters, defaultFiltersState, filtersToParams } from './Filters';
import { pnlGet } from './api';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽';
}

function formatAxisValue(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(n);
}

function formatKg(n: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' кг';
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <p className="text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>{title}</p>
      <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  );
}

export function DashboardView() {
  const [filters, setFilters] = useState(defaultFiltersState);
  const [pnl, setPnl] = useState<any>(null);
  const [unitEcon, setUnitEcon] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const updateFilter = (key: string, value: string | number) => setFilters((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    setError(null);
    const params = filtersToParams(filters);
    Promise.all([
      pnlGet('/api/pnl', params),
      pnlGet('/api/unit-economics', params),
      pnlGet('/api/charts', params),
    ])
      .then(([p, u, c]: any[]) => {
        setPnl(p?.error ? null : (p?.pnl ?? p));
        setUnitEcon(u?.error ? null : u);
        setCharts(c?.error ? null : c);
        if (p?.error || u?.error || c?.error) setError((p?.error || u?.error || c?.error) ?? 'Ошибка загрузки');
      })
      .catch((err) => {
        setPnl(null); setUnitEcon(null); setCharts(null);
        setError(err?.message ?? 'Ошибка загрузки данных');
      });
  }, [filters.dateFrom, filters.dateTo, filters.direction, filters.transportType]);

  const stageLabels: Record<string, string> = {
    PICKUP: 'Забор', DEPARTURE_WAREHOUSE: 'Склад отпр.', MAINLINE: 'Магистраль',
    ARRIVAL_WAREHOUSE: 'Склад приб.', LAST_MILE: 'Последняя миля',
  };

  const lineData = charts?.revenueLine?.map((r: any, i: number) => ({
    month: r.month,
    Выручка: charts.revenueLine[i]?.value ?? 0,
    COGS: charts.cogsLine[i]?.value ?? 0,
    EBITDA: charts.ebitdaLine[i]?.value ?? 0,
    'Вал.прибыль–OPEX–CAPEX': charts.netAfterCapexLine?.[i]?.value ?? 0,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Dashboard</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Ключевые показатели и графики</p>
      </div>
      <Filters {...filters} onChange={updateFilter} />
      {error && (
        <div
          className="rounded-xl p-4"
          style={{
            background: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            color: 'var(--color-error-text)',
          }}
        >
          {error}
        </div>
      )}
      {pnl && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard title="Выручка" value={formatRub(pnl.revenue)} />
          <KpiCard title="COGS" value={formatRub(pnl.cogs)} />
          <KpiCard title="Валовая прибыль" value={formatRub(pnl.grossProfit)} />
          <KpiCard title="EBITDA" value={formatRub(pnl.ebitda)} />
          <KpiCard title="EBITDA %" value={`${pnl.ebitdaPercent?.toFixed(1) ?? 0}%`} />
          <KpiCard title="CAPEX" value={formatRub(pnl.capex)} />
          <KpiCard title="EBITDA – CAPEX" value={formatRub(pnl.netAfterCapex)} />
          <KpiCard title="Платный вес за период" value={unitEcon ? formatKg(unitEcon.paidWeightKg ?? 0) : '—'} />
          <KpiCard title="Себестоимость 1 кг" value={unitEcon ? formatRub(unitEcon.cogsPerKg) : '—'} />
        </div>
      )}
      {charts && (
        <div className="grid gap-6">
          <div
            className="rounded-xl p-6"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Выручка / COGS / EBITDA</h2>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="left"
                    width={90}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => formatAxisValue(Number(v) || 0)}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    width={90}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => formatAxisValue(Number(v) || 0)}
                  />
                  <Tooltip formatter={(v: number) => formatRub(v)} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="Выручка" stroke="#3b82f6" strokeWidth={2} />
                  <Line yAxisId="left" type="monotone" dataKey="COGS" stroke="#ef4444" strokeWidth={2} />
                  <Line yAxisId="left" type="monotone" dataKey="EBITDA" stroke="#10b981" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="Вал.прибыль–OPEX–CAPEX" stroke="#f97316" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div
              className="rounded-xl p-6"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>COGS по этапам логистики</h2>
              <div style={{ height: 256 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.cogsByStage?.map((x: any) => ({ name: stageLabels[x.stage] ?? x.stage, value: x.amount })) ?? []} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={(v) => formatAxisValue(Number(v) || 0)} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatRub(v)} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div
              className="rounded-xl p-6"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>EBITDA по направлениям</h2>
              <div style={{ height: 256 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.revenueByDir?.map((x: any) => ({ name: x.label ?? (x.direction === 'MSK_TO_KGD' ? 'МСК → КГД' : x.direction === 'KGD_TO_MSK' ? 'КГД → МСК' : x.direction), value: x.amount })) ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" />
                    <YAxis width={90} tickFormatter={(v) => formatAxisValue(Number(v) || 0)} />
                    <Tooltip formatter={(v: number) => formatRub(v)} />
                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div
            className="rounded-xl p-6"
            style={{
              maxWidth: 400,
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Структура OPEX</h2>
            <div style={{ height: 256 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={charts.opexByDept?.map((x: any, i: number) => ({ name: x.dept, value: x.amount, fill: COLORS[i % COLORS.length] })) ?? []}
                    cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value"
                    label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {(charts.opexByDept ?? []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatRub(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
