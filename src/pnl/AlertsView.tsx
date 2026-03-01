import { useEffect, useState } from 'react';
import { Filters, defaultFiltersState, filtersToParams } from './Filters';
import { pnlGet } from './api';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface Alert { type: string; message: string; severity: 'warning' | 'error'; }

export function AlertsView() {
  const [filters, setFilters] = useState(defaultFiltersState);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const updateFilter = (key: string, value: string | number) => setFilters((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    pnlGet<any>('/api/alerts', filtersToParams(filters)).then((d) => setAlerts(d.alerts ?? [])).finally(() => setLoading(false));
  }, [filters.month, filters.year, filters.direction, filters.transportType]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Алерты</h1><p className="text-slate-500">Уведомления о превышении порогов</p></div>
      <Filters {...filters} onChange={updateFilter} />
      {loading ? <div className="animate-pulse">Загрузка...</div> : alerts.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 flex items-center gap-4">
          <CheckCircle className="w-12 h-12 shrink-0" style={{ color: '#10b981' }} />
          <div>
            <p className="font-medium" style={{ color: '#065f46' }}>Все показатели в норме</p>
            <p className="text-sm mt-1" style={{ color: '#047857' }}>Пороги: себестоимость/кг ↑ &gt;10%, магистраль &gt;60% COGS, маржа/кг &lt;5₽, overhead &gt;15%</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-4 p-4 rounded-xl border ${a.severity === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" style={{ color: a.severity === 'error' ? '#ef4444' : '#f59e0b' }} />
              <div>
                <p className="font-medium" style={{ color: a.severity === 'error' ? '#991b1b' : '#92400e' }}>{a.message}</p>
                <p className="text-xs text-slate-500 mt-1">Тип: {a.type}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
        <h3 className="font-medium text-slate-700 mb-2">Пороги алертов</h3>
        <ul className="text-sm text-slate-600 space-y-1">
          <li>• Себестоимость / кг ↑ &gt; X%</li>
          <li>• Магистраль &gt; 60% COGS</li>
          <li>• Маржа / кг ↓ &lt; 5 ₽</li>
          <li>• Overhead &gt; 15% выручки</li>
        </ul>
      </div>
    </div>
  );
}
