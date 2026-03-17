import { useEffect, useState } from 'react';
import { Filters, defaultFiltersState, filtersToParams } from './Filters';
import { pnlGet } from './api';
import { OPERATION_TYPE_LABELS, DEPARTMENT_LABELS, LOGISTICS_STAGE_LABELS, DIRECTION_LABELS } from './constants';

function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽';
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('ru-RU');
}

export function OperationsView() {
  const [filters, setFilters] = useState(defaultFiltersState);
  const [ops, setOps] = useState<any[]>([]);
  const updateFilter = (key: string, value: string | number) => setFilters((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    pnlGet<any[]>('/api/operations', filtersToParams(filters)).then(setOps);
  }, [filters.dateFrom, filters.dateTo, filters.direction, filters.transportType]);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Детализация операций</h1><p className="text-slate-500">Таблица всех операций с фильтрами</p></div>
      <Filters {...filters} onChange={updateFilter} />
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Дата</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Контрагент</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Назначение</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Сумма</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Тип</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Подразделение</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Этап</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Направление</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ops.map((op: any) => (
              <tr key={op.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-700">{formatDate(op.date)}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{op.counterparty}</td>
                <td className="px-4 py-3 text-sm text-slate-600" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.purpose}</td>
                <td className="px-4 py-3 text-sm text-right font-medium">{formatRub(op.amount)}</td>
                <td className="px-4 py-3 text-sm">{(OPERATION_TYPE_LABELS as Record<string, string>)[op.operationType] ?? op.operationType}</td>
                <td className="px-4 py-3 text-sm">{(DEPARTMENT_LABELS as Record<string, string>)[op.department] ?? op.department}</td>
                <td className="px-4 py-3 text-sm">{op.logisticsStage ? (LOGISTICS_STAGE_LABELS as Record<string, string>)[op.logisticsStage] : '—'}</td>
                <td className="px-4 py-3 text-sm">{op.direction ? (DIRECTION_LABELS as Record<string, string>)[op.direction] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ops.length === 0 && <div className="p-12 text-center text-slate-500">Нет операций за выбранный период</div>}
      </div>
    </div>
  );
}
