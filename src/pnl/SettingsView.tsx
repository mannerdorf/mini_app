import { useEffect, useMemo, useState } from 'react';

type MetricConfig = { id: string; title: string; description: string; defaultEnabled: boolean; };

const METRICS: MetricConfig[] = [
  { id: 'freeCashFlow', title: 'Свободный денежный поток (EBITDA – CAPEX – кредиты)', description: 'Показывает, сколько денег остаётся после операционной прибыли, инвестиций и обязательных платежей.', defaultEnabled: true },
  { id: 'opexRatio', title: 'OPEX / Выручка', description: 'Доля операционных расходов в выручке.', defaultEnabled: true },
  { id: 'capexEfficiency', title: 'CAPEX / Выручка', description: 'Отношение капитальных затрат к выручке.', defaultEnabled: false },
  { id: 'trendDynamics', title: 'Δ к предыдущему периоду', description: 'Показывает, как KPI изменился по сравнению с прошлым месяцем.', defaultEnabled: true },
  { id: 'unitCapex', title: 'CAPEX на 1 кг', description: 'Распределяет капитальные затраты по объёму перевозок.', defaultEnabled: false },
  { id: 'marginBridge', title: 'Маржинальный мост (Выручка → FCF)', description: 'Визуальное представление влияния COGS, OPEX, CAPEX на конечный денежный поток.', defaultEnabled: false },
];

const STORAGE_KEY = 'haulz_metric_settings';
type MetricState = Record<string, boolean>;

export function SettingsView() {
  const defaults = useMemo(() => { const s: MetricState = {}; METRICS.forEach((m) => { s[m.id] = m.defaultEnabled; }); return s; }, []);
  const [metricState, setMetricState] = useState<MetricState>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) setMetricState((prev) => ({ ...prev, ...JSON.parse(raw) })); } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => { if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(metricState)); }, [loaded, metricState]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Настройки метрик</h1><p className="text-slate-500">Управляйте дополнительными показателями.</p></div>
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Метрики P&L и дашборда</h2>
        <p className="text-sm text-slate-500 mb-6">Включите нужные показатели. Настройки сохраняются в браузере.</p>
        <div className="space-y-4">
          {METRICS.map((m) => (
            <div key={m.id} className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between border border-slate-200 rounded-lg p-4">
              <div style={{ maxWidth: 600 }}>
                <h3 className="font-medium text-slate-900">{m.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{m.description}</p>
              </div>
              <label className="inline-flex items-center gap-2 mt-1">
                <input type="checkbox" checked={Boolean(metricState[m.id])} onChange={(e) => setMetricState((prev) => ({ ...prev, [m.id]: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                <span className="text-sm text-slate-600">{metricState[m.id] ? 'Включено' : 'Выключено'}</span>
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
