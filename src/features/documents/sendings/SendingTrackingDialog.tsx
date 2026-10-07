import React, { useEffect, useState } from 'react';
import { PackageSearch, X, RotateCw } from 'lucide-react';
import { GuardedDialog } from '../../../components/GuardedDialog';
import { fetchFescoTracking, type TrackingContainer } from '../../../api/client/fesco';
import type { DocumentsAuth } from '../../../api/client/documentsAuth';
import './sending-tracking-dialog.css';

export function extractContainerNumber(vehicle: string): string {
  return vehicle.toUpperCase().match(/\b([A-Z]{4})[\s-]*(\d{7})\b/)?.slice(1).join('') || '';
}
const date = (value?: string) => value ? value.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3.$2.$1').replace('T', ' ') : '—';
export function SendingTrackingDialog({ ferry, auth, initialNumber, onClose }: {
  ferry: { id: number; name: string; provider: string }; auth: DocumentsAuth; initialNumber: string; onClose: () => void;
}) {
  const [input, setInput] = useState(initialNumber);
  const [query, setQuery] = useState(initialNumber);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [containers, setContainers] = useState<TrackingContainer[]>([]);
  const [updated, setUpdated] = useState('');
  useEffect(() => {
    let stopped = false;
    setContainers([]); setError(''); setUpdated(''); setLoading(false);
    if (!query) return;
    if (ferry.provider.toUpperCase() !== 'FESCO') { setError(`Трекинг ${ferry.provider} пока не подключён`); return; }
    setLoading(true);
    fetchFescoTracking(auth, ferry.id, query).then(result => {
      if (stopped) return;
      if (!result.ok) { setError(result.error || 'Не удалось загрузить трекинг'); return; }
      setContainers(result.data || []); setUpdated(result.fetchedAt || '');
      if (!result.data?.length) setError('Контейнер или коносамент не найден');
    }).catch(error => { if (!stopped) setError(error instanceof Error ? error.message : 'Не удалось загрузить трекинг. Повторите запрос.'); })
      .finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [query, refresh, ferry.id, ferry.provider, auth.login, auth.password]);
  const field = (label: string, value: React.ReactNode) => <div><dt>{label}</dt><dd>{value ?? '—'}</dd></div>;
  return <GuardedDialog title={`Трекинг ${ferry.provider} — ${ferry.name}`} onClose={onClose} className="sending-tracking-dialog">
    <header><PackageSearch size={24} /><div><h2>Трекинг {ferry.provider}</h2><p>{ferry.name}</p></div><button className="tracking-icon" onClick={onClose} aria-label="Закрыть трекинг"><X /></button></header>
    <form onSubmit={event => { event.preventDefault(); const next = input.trim().toUpperCase().replace(/\s+/g, ''); setQuery(next); setRefresh(n => n + 1); }}>
      <label htmlFor="sending-tracking-number">Номер контейнера, коносамента или заказа</label>
      <div className="tracking-search"><input id="sending-tracking-number" value={input} maxLength={50} onChange={event => setInput(event.target.value)} placeholder="AXIU1634881" required /><button type="submit" disabled={loading}>Отследить</button><button className="tracking-icon" type="button" title="Обновить" aria-label="Обновить трекинг" disabled={loading || !query} onClick={() => setRefresh(n => n + 1)}><RotateCw size={18} /></button></div>
    </form>
    {loading && <p role="status">Загружаем данные {ferry.provider}…</p>}
    {error && <p role="alert">{error}</p>}
    {containers.map((container, index) => <article key={`${container.containerNumber}-${index}`}>
      <h3>Контейнер {container.containerNumber || query}</h3>
      {container.unavailable ? <p>Трекинг этого контейнера недоступен у перевозчика</p> : <>
        <dl className="tracking-fields">
          {field('Коносамент', container.order?.bills?.join(', ') || container.billId || '—')}
          {field('Тип и принадлежность КТК', container.order?.ownerShip)}
          {field('Заказ', container.order?.orderId)}{field('Основной заказ', container.order?.rootOrderId)}
          {field('Сервис', container.order?.type || container.type)}
          {field('Таможенные условия', container.order?.customCode === 0 ? 'DDP (ГТД)' : container.order?.customCode === 1 ? 'DDU (ВТТ)' : container.order?.customCode)}
        </dl>
        <h3>Маршрут</h3>
        <ol className="tracking-timeline">{(container.segments || []).map(segment => <li key={segment.id} className={segment.currentSegment ? 'is-current' : ''}>
          <h4>{segment.departureLocation || '—'} → {segment.destinationLocation || '—'}</h4>
          <p>{({ SEA: 'Море', RR: 'Железная дорога', TR: 'Автоперевозка' } as Record<string, string>)[segment.segmentType || ''] || segment.segmentType} · {segment.completed ? 'Завершён' : segment.inProgress ? 'В пути' : segment.plan ? 'Планируется' : '—'}{segment.currentSegment && ' · Текущий участок'}</p>
          <dl className="tracking-fields">
            {field('Страна отправления', segment.countryOfDepartureLocation)}{field('Страна назначения', segment.countryOfDestinationLocation)}
            {field('Транспортное средство', segment.transport?.name || segment.transport?.nameLatin)}{field('Рейс', segment.transport?.voyageNumber)}
            {field('Отправление, факт', date(segment.departureDate))}{field('Прибытие, факт', date(segment.destinationDate))}
            {field('Отправление, план', date(segment.planingDepartureDate))}{field('Прибытие, план', date(segment.planingDestinationDate))}
            {segment.remainingDistance != null && field('До назначения', `${segment.remainingDistance} км`)}
            {segment.prebooking && field('Предварительное бронирование', 'Да')}{segment.telex && field('Телекс-релиз', 'Да')}
          </dl>
        </li>)}</ol>
        <h3>Грузовые операции</h3>
        <ol className="tracking-timeline">{(container.events?.data || []).map(event => <li key={event.id} className={event.id === container.events?.lastEventId ? 'is-current' : ''}>
          <h4>{date(event.date)}{event.id === container.events?.lastEventId && <span className="tracking-current">Груз здесь</span>}</h4>
          <dl className="tracking-fields">{field('Грузовая операция', event.operation)}{field('Место', event.location)}{field('Транспортное средство', event.transport)}
            {event.type === 'planning' && field('Событие', 'Планирование')}
            {event.totalDistance != null && field('Расстояние', `${event.totalDistance} км`)}{event.remainingDistance != null && field('До назначения', `${event.remainingDistance} км`)}
          </dl>
        </li>)}</ol>
        {!container.events?.data?.length && <p>Перевозчик пока не передал грузовые операции</p>}
      </>}
    </article>)}
    {updated && <footer>Данные FESCO · получены {new Date(updated).toLocaleString('ru-RU')}<br />Даты операций указаны в том виде, в котором их передаёт перевозчик.</footer>}
  </GuardedDialog>;
}
