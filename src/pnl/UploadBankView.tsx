import { useState, useRef } from 'react';
import { pnlPostForm } from './api';
import { Upload, FileSpreadsheet, CheckCircle } from 'lucide-react';

export function UploadBankView() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await pnlPostForm('/api/upload/bank', fd);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
      setResult(data); setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Загрузка банковской выписки</h1><p className="text-slate-500">XLS / XLSX / CSV — авто-парсинг и классификация</p></div>
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm" style={{ maxWidth: 560 }}>
        <div className="space-y-4">
          <div onClick={() => inputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors">
            <input ref={inputRef} type="file" accept=".xls,.xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }} className="hidden" />
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-3" style={{ color: '#94a3b8' }} />
            <p className="text-slate-600 font-medium">{file ? file.name : 'Выберите файл выписки'}</p>
            <p className="text-sm text-slate-400 mt-1">Поддерживаются: дата, контрагент, назначение, сумма</p>
          </div>
          {file && <button onClick={handleSubmit} disabled={loading} className="w-full py-3 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: '#2563eb' }}><Upload className="w-5 h-5" /> {loading ? 'Загрузка...' : 'Загрузить'}</button>}
          {result && <div className="p-4 bg-emerald-50 rounded-lg flex items-center gap-3" style={{ color: '#047857' }}><CheckCircle className="w-6 h-6 shrink-0" /><div><p className="font-medium">Успешно загружено</p><p className="text-sm">Добавлено операций: {result.created}</p></div></div>}
          {error && <div className="p-4 bg-red-50 rounded-lg" style={{ color: '#b91c1c' }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
