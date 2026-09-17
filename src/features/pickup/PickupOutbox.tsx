import React, { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { cities, statusLabels, type Job, type City } from '../../../lib/pickup/model';
import type { Pending } from './outbox';

export function PickupOutbox({ items, jobs, busy, stale, onSave, onSync, onRefresh }: {
  items: Pending[]; jobs: Job[]; busy: boolean; stale: boolean;
  onSave: (items: Pending[]) => Promise<void>; onSync: () => Promise<void>; onRefresh: () => Promise<void>;
}) {
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const disabled = busy || saving;
  async function save(next: Pending[]) {
    if (lock.current || busy) return;
    lock.current = true; setSaving(true); setError('');
    try { await onSave(next); } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setSaving(false); }
  }
  if (!items.length) return null;
  return <section className="pk-panel" aria-label="Сохранённые отметки">
    <h3>Ожидают отправки: {items.length}</h3>
    <p>Отправьте сохранённые отметки. При конфликте сверьте данные точки. Фото останутся на устройстве до отправки или вашего удаления.</p>
    <div className="pk-actions">
      <button disabled={disabled} onClick={() => void onSync()}>Отправить отметки</button>
      <button disabled={disabled} onClick={() => void onRefresh()}>Обновить данные для сверки</button>
    </div>
    {error && <p className="pk-error" role="alert">{error}</p>}
    {items.map(item => {
      const job = jobs.find(j => j.id === item.body.id);
      const photos = Array.isArray(item.body.photos) ? item.body.photos.filter((p): p is string => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,')) : [];
      return <article className="pk-panel" key={item.id}>
        <strong>{item.title}</strong>
        <p>{job?.data.address || item.context?.address || `Точка ${String(item.body.id)}`}</p>
        {item.context && <p className="pk-hint">{cities[item.context.city as City] || item.context.city} · Дата маршрута: {item.context.date}</p>}
        <p>Сохранено: {String(item.body.actual_places ?? '—')} мест · фото: {photos.length}</p>
        {item.body.note ? <p>{String(item.body.note)}</p> : null}
        {!!photos.length && <details><summary>Просмотреть сохранённые фото</summary>{photos.map((photo,i) => <img key={i} src={photo} alt={`Фото груза ${i+1}`} style={{maxWidth:'100%',maxHeight:240}} />)}</details>}
        {item.error && <p className="pk-error" role="alert">{item.error}</p>}
        {job && <p>На сервере: {statusLabels[job.status]}, версия {job.version}; заказчик: {job.data.customerName}.</p>}
        {!job && item.error && <p>Выберите дату и город этой точки, затем обновите данные для сверки.</p>}
        <div className="pk-actions">
          {item.status === 409 && !stale && job && ['pending','arrived'].includes(job.status) && <button disabled={disabled} onClick={() => {
            if (!window.confirm(`На сервере: ${job.data.address}, статус «${statusLabels[job.status]}», версия ${job.version}. Применить сохранённую отметку с фото к этой версии?`)) return;
            const id = crypto.randomUUID();
            void save(items.map(p => p.id === item.id ? {...p,id,error:undefined,status:undefined,body:{...p.body,requestId:id,version:job.version}} : p));
          }}>Подтвердить новую версию для отправки</button>}
          <button disabled={disabled} aria-label="Удалить локальную отметку" title="Удалить локальную отметку" onClick={() => {
            if (window.confirm('Удалить локальную отметку вместе с фото? Сначала убедитесь, что результат сохранён на сервере.')) void save(items.filter(p => p.id !== item.id));
          }}><Trash2 size={18} aria-hidden /></button>
        </div>
      </article>;
    })}
  </section>;
}
