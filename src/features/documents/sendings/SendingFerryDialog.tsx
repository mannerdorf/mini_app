import React, { useEffect, useState } from 'react';
import { Loader2, RotateCw, Ship, X } from 'lucide-react';
import { GuardedDialog } from '../../../components/GuardedDialog';
import { formatPortDest, NAV_STATUS_LABELS } from '../../../components/shared/VesselInfoPanel';
import { SendingVesselMap } from './SendingVesselMap';
import { fetchMarinesiaShip, type MarinesiaVessel, type MarinesiaTrackPoint } from '../../../api/client/ais';
import './sending-ferry-dialog.css';

export function SendingFerryDialog({ ferry, onClose }: {
  ferry: { mmsi: string; name: string }; onClose: () => void;
}) {
  const [vessel, setVessel] = useState<MarinesiaVessel | null>(null);
  const [track, setTrack] = useState<MarinesiaTrackPoint[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let stopped = false;
    setLoading(true); setError('');
    fetchMarinesiaShip(ferry.mmsi, true).then(result => {
      if (stopped) return;
      if (!result.ok) { setError(result.error || 'Не удалось получить данные судна'); return; }
      if (!result.vessel) { setError('Судно не найдено'); return; }
      setVessel({ ...result.vessel, name: ferry.name });
      setTrack(result.track || []);
      setHistoryError(result.historyError || '');
    }).catch(e => { if (!stopped) setError((e as Error).message || 'Не удалось получить данные судна'); })
      .finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [ferry.mmsi, ferry.name, refresh]);
  const coordinate = (value: number | undefined, positive: string, negative: string) => typeof value === 'number' && Number.isFinite(value) ? `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}` : '—';
  const number = (value: number | undefined, unit: string) => typeof value === 'number' && Number.isFinite(value) ? `${value} ${unit}` : '—';
  const field = (label: string, value: string) => <div><dt>{label}</dt><dd>{value || '—'}</dd></div>;
  return <GuardedDialog title={`Паром ${ferry.name} — движение судна`} onClose={onClose} className="sending-ferry-dialog">
    {vessel ? <SendingVesselMap vessel={vessel} track={track} /> : <div className="sending-vessel-map-placeholder" />}
    <aside className="sending-vessel-card" aria-label="Информация о судне">
      <header className="sending-vessel-card__header">
        <Ship size={24} aria-hidden="true" />
        <div><h2>{ferry.name}</h2><p>Паром · MMSI {ferry.mmsi}</p></div>
        <button type="button" className="sending-ferry-dialog__icon" aria-label="Закрыть карту парома" title="Закрыть" onClick={onClose}><X size={20} /></button>
      </header>
      {loading && <p role="status" className="sending-vessel-card__notice">Обновляем положение судна…</p>}
      {error && <p role="alert" className="sending-ferry-dialog__error">{error}</p>}
      {historyError && <p role="status" className="sending-vessel-card__notice">{historyError}</p>}
      {track.length > 0 && <p className="sending-vessel-card__notice">История AIS · {track.length} точек<br />{track[0].timeUtc.replace('T', ' ').replace(/Z$/, '')} — {track[track.length - 1].timeUtc.replace('T', ' ').replace(/Z$/, '')} (UTC)</p>}
      <section className="sending-vessel-card__section">
        <dl className="sending-vessel-card__grid">
          <div className="sending-vessel-card__wide"><dt>Порт назначения</dt><dd>{vessel?.dest ? formatPortDest(vessel.dest) : '—'}</dd></div>
          {field('Ожидаемое прибытие (UTC)', vessel?.eta || '—')}
          {field('Осадка', number(vessel?.draught, 'м'))}
          <div className="sending-vessel-card__wide"><dt>Статус навигации</dt><dd><span className={`sending-vessel-card__status ${vessel?.status === 0 || vessel?.status === 8 ? 'is-moving' : ''}`} />{vessel?.status != null ? NAV_STATUS_LABELS[vessel.status] || `Код ${vessel.status}` : '—'}</dd></div>
        </dl>
      </section>
      <section className="sending-vessel-card__section">
        <h3>Положение и движение</h3>
        <dl className="sending-vessel-card__grid">
          {field('Широта', coordinate(vessel?.lat, 'N', 'S'))}
          {field('Долгота', coordinate(vessel?.lon, 'E', 'W'))}
          {field('Скорость (SOG)', number(vessel?.sog, 'узлов'))}
          {field('Курс относительно земли (COG)', number(vessel?.cog, '°'))}
          {field('Направление носа (HDT)', number(vessel?.hdt, '°'))}
        </dl>
      </section>
      <footer className="sending-vessel-card__footer">
        <div><span>Последнее обновление (UTC)</span><p>{vessel?.timeUtc?.replace('T', ' ').replace(/Z$/, '') || '—'}</p></div>
        <button type="button" className="sending-ferry-dialog__icon" disabled={loading} aria-label="Обновить положение судна" title="Обновить" onClick={() => setRefresh(n => n + 1)}>
          {loading ? <Loader2 size={20} className="animate-spin" /> : <RotateCw size={20} />}
        </button>
      </footer>
    </aside>
    <div className="sending-vessel-map-caption">Marinesia · {track.length > 1 ? 'Пройденный путь по данным AIS' : 'Последняя позиция судна'}</div>
  </GuardedDialog>;
}
