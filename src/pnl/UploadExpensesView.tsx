import { useState, useEffect } from 'react';
import { pnlGet } from './api';
import { UploadExpenseForm } from './UploadExpenseForm';

interface Subdivision { id: string; code?: string | null; name: string; department: string; logisticsStage: string | null; sortOrder: number; }

function guessIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('забор') || n.includes('pickup')) return 'truck';
  if (n.includes('магистраль') || n.includes('mainline')) return 'route';
  if (n.includes('миля') || n.includes('last mile')) return 'package';
  return 'building';
}

export function UploadExpensesView() {
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([]);
  const [loading, setLoading] = useState(true);
  const [subdivisionId, setSubdivisionId] = useState('');

  useEffect(() => {
    pnlGet<Subdivision[]>('/api/subdivisions').then((data) => {
      const list = Array.isArray(data) ? data : [];
      setSubdivisions(list);
      if (list.length && !subdivisionId) setSubdivisionId(list[0].id);
    }).finally(() => setLoading(false));
  }, []);

  const sub = subdivisions.find((s) => s.id === subdivisionId);

  const subdivisionSelect = (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      Подразделение
      <select value={subdivisionId} onChange={(e) => setSubdivisionId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-slate-900" style={{ minWidth: 220 }}>
        {subdivisions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );

  if (loading) return <div className="animate-pulse text-slate-500 p-6">Загрузка...</div>;
  if (!sub && subdivisions.length === 0) return <div className="space-y-6"><h1 className="text-2xl font-bold text-slate-900">Расходы</h1><p className="text-slate-500">Нет подразделений. Добавьте в справочник подразделений.</p></div>;
  if (!sub) return null;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Расходы</h1><p className="text-slate-500">Ввод затрат по подразделениям</p></div>
      <UploadExpenseForm department={sub.department} logisticsStage={sub.logisticsStage} label={sub.name} description={`Расходы по подразделению «${sub.name}»`} subdivisionSelect={subdivisionSelect} />
    </div>
  );
}
