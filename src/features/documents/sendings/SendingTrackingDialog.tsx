import React, { useEffect, useState } from 'react';
import { PackageSearch, X, RotateCw } from 'lucide-react';
import { GuardedDialog } from '../../../components/GuardedDialog';
import { fetchFescoTracking, type TrackingContainer, type TrackingSegment } from '../../../api/client/fesco';
import type { DocumentsAuth } from '../../../api/client/documentsAuth';
import './sending-tracking-dialog.css';

export function extractContainerNumber(vehicle: string): string {
  return vehicle.toUpperCase().match(/\b([A-Z]{4})[\s-]*(\d{7})\b/)?.slice(1).join('') || '';
}
export const startedSegments = (segments: TrackingSegment[]) => segments.filter(segment => segment.completed || segment.inProgress || !!segment.departureDate?.trim());
const mode = (type?: string) => ({ SEA: 'Морская перевозка', RR: 'Железнодорожная перевозка', TR: 'Автоперевозка' } as Record<string, string>)[type || ''] || type || 'Перевозка';
const route = (segment: TrackingSegment) => segment.departureLocation === segment.destinationLocation ? segment.departureLocation || '—' : `${segment.departureLocation || '—'} → ${segment.destinationLocation || '—'}`;
const operation = (text?: string) => ({ 'Arrived Full from Shipper': 'Гружёный контейнер принят от отправителя', 'Departed Empty to Shipper': 'Порожний контейнер отправлен отправителю', 'Discharged from Vessel': 'Контейнер выгружен с судна' } as Record<string, string>)[text || ''] || text || 'Грузовая операция';
const date = (value?: string) => value ? value.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3.$2.$1').replace('T', ' ') : '—';
export function SendingTrackingDialog({ ferry, auth, initialNumber, onClose }: {
  ferry: { id: number; name: string; provider: string }; auth: DocumentsAuth; initialNumber: string; onClose: () => void;
}) {
  const query = initialNumber.trim().toUpperCase().replace(/\s+/g, '');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [containers, setContainers] = useState<TrackingContainer[]>([]);
  const [updated, setUpdated] = useState('');
  useEffect(() => {
    let stopped = false;
    setContainers([]); setError(''); setUpdated(''); setLoading(false);
    if (!query) { setError('В отправке не указан номер контейнера'); return; }
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
  const field = (label: string, value: React.ReactNode) => value == null || value === '' || value === '—' ? null : <div><dt>{label}</dt><dd>{value}</dd></div>;
  return <GuardedDialog title={`Трекинг ${ferry.provider} — ${ferry.name}`} onClose={onClose} className="sending-tracking-dialog">
    <header><PackageSearch size={24} /><div><h2>Трекинг {ferry.provider}</h2><p>{ferry.name}</p></div><button className="tracking-icon" type="button" title="Обновить" aria-label="Обновить трекинг" disabled={loading || !query} onClick={() => setRefresh(n => n + 1)}><RotateCw size={18} /></button><button className="tracking-icon" onClick={onClose} aria-label="Закрыть трекинг"><X /></button></header>
    {loading && <p role="status">Загружаем данные {ferry.provider}…</p>}
    {error && <p role="alert">{error}</p>}
    {containers.map((container, index) => {
      const segments = startedSegments(container.segments || []);
      const current = segments.find(segment => segment.currentSegment && !segment.completed) || segments.find(segment => segment.inProgress) || segments.find(segment => !segment.completed && !!segment.departureDate?.trim());
      const events = (container.events?.data || []).filter(event => event.type?.toLowerCase() !== 'planning')
        .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const latest = events.find(event => event.id === container.events?.lastEventId) || events[0];
      return <article key={`${container.containerNumber}-${index}`}>
        <div className="tracking-container-heading"><h3>{container.containerNumber || query}</h3><span>Контейнер</span></div>
        {container.unavailable ? <p>Трекинг этого контейнера недоступен у перевозчика</p> : <>
          <section className="tracking-now" aria-label="Текущий статус">
            <span className="tracking-eyebrow">Сейчас</span>
            <h3>{current ? 'В пути' : segments.length && segments.every(segment => segment.completed) ? 'Этапы перевозки завершены' : 'Ожидаем данные перевозчика'}</h3>
            {current && <><p className="tracking-now-route">{route(current)}</p><p>{[mode(current.segmentType), current.transport?.name || current.transport?.nameLatin, current.transport?.voyageNumber && `Рейс ${current.transport.voyageNumber}`].filter(Boolean).join(' · ')}</p>
              {current.planingDestinationDate && <p>Ожидаемое прибытие: <strong>{date(current.planingDestinationDate)}</strong></p>}</>}
            {latest && <div className="tracking-last-operation"><span>Последняя операция · {date(latest.date)}</span><p>{operation(latest.operation)}{latest.location && ` · ${latest.location}`}</p></div>}
          </section>
          <div className="tracking-bill">Коносамент <strong>{container.order?.bills?.join(', ') || container.billId || '—'}</strong></div>
          <details className="tracking-details"><summary>Сведения о контейнере</summary><dl className="tracking-fields">
            {field('Принадлежность КТК', container.order?.ownerShip)}{field('Заказ', container.order?.orderId)}{field('Основной заказ', container.order?.rootOrderId)}
            {field('Сервис', container.order?.type || container.type)}{field('Таможенные условия', container.order?.customCode === 0 ? 'DDP (ГТД)' : container.order?.customCode === 1 ? 'DDU (ВТТ)' : container.order?.customCode)}
          </dl></details>
          {!!segments.length && <><h3>Этапы перевозки</h3><ol className="tracking-stages">{segments.map(segment => <li key={segment.id} className={segment === current ? 'is-current' : ''}>
            <div className="tracking-stage-heading"><h4>{route(segment)}</h4><span className="tracking-stage-status">{segment.completed ? 'Завершён' : 'В пути'}</span></div>
            <p>{[mode(segment.segmentType), segment.transport?.name || segment.transport?.nameLatin, segment.transport?.voyageNumber && `Рейс ${segment.transport.voyageNumber}`].filter(Boolean).join(' · ')}</p>
            <div className="tracking-stage-dates">
              {segment.departureDate && <span>Отправлен <strong>{date(segment.departureDate)}</strong></span>}
              {segment.destinationDate && <span>Прибыл <strong>{date(segment.destinationDate)}</strong></span>}
            </div>
            {(segment.countryOfDepartureLocation || segment.countryOfDestinationLocation || segment.planingDepartureDate || segment.planingDestinationDate || segment.remainingDistance != null || segment.prebooking || segment.telex) && <details className="tracking-details"><summary>Подробнее об этапе</summary><dl className="tracking-fields">
              {field('Страна отправления', segment.countryOfDepartureLocation)}{field('Страна назначения', segment.countryOfDestinationLocation)}
              {segment.planingDepartureDate !== segment.departureDate && field('Отправление, план', date(segment.planingDepartureDate))}
              {field('Прибытие, план', date(segment.planingDestinationDate))}
              {segment.remainingDistance != null && field('До назначения', `${segment.remainingDistance} км`)}
              {segment.prebooking && field('Предварительное бронирование', 'Да')}{segment.telex && field('Телекс-релиз', 'Да')}
            </dl></details>}
          </li>)}</ol></>}
          <h3>История операций</h3>
          {events.length ? <ol className="tracking-events">{events.map(event => <li key={event.id}>
            <time>{date(event.date)}</time><div><h4>{operation(event.operation)}</h4>
              <p>{[event.location, event.transport].filter(Boolean).join(' · ')}</p>
              {(event.totalDistance != null || event.remainingDistance != null || operation(event.operation) !== event.operation) && <details className="tracking-details"><summary>Подробнее</summary><dl className="tracking-fields">
                {operation(event.operation) !== event.operation && field('Операция перевозчика', event.operation)}
                {event.totalDistance != null && field('Расстояние', `${event.totalDistance} км`)}{event.remainingDistance != null && field('До назначения', `${event.remainingDistance} км`)}
              </dl></details>}
            </div>
          </li>)}</ol> : <p>Перевозчик пока не передал грузовые операции</p>}
        </>}
      </article>;
    })}
    {updated && <footer>Данные FESCO · получены {new Date(updated).toLocaleString('ru-RU')}<br />Даты операций указаны в том виде, в котором их передаёт перевозчик.</footer>}
  </GuardedDialog>;
}
