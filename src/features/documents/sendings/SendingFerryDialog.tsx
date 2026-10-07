import React, { useEffect, useState } from 'react';
import { Loader2, RotateCw, X } from 'lucide-react';
import { GuardedDialog } from '../../../components/GuardedDialog';
import { VesselInfoPanel } from '../../../components/shared/VesselInfoPanel';
import { fetchMarinesiaShip, type MarinesiaVessel } from '../../../api/client/ais';
import './sending-ferry-dialog.css';

export function SendingFerryDialog({ ferry, onClose }: {
  ferry: { mmsi: string; name: string }; onClose: () => void;
}) {
  const [vessel, setVessel] = useState<MarinesiaVessel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let stopped = false;
    setLoading(true); setError('');
    fetchMarinesiaShip(ferry.mmsi).then(result => {
      if (stopped) return;
      if (!result.ok) { setError(result.error || 'Не удалось получить данные судна'); return; }
      if (!result.vessel) { setError('Судно не найдено'); return; }
      setVessel({ ...result.vessel, name: ferry.name });
    }).catch(e => { if (!stopped) setError((e as Error).message || 'Не удалось получить данные судна'); })
      .finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [ferry.mmsi, ferry.name, refresh]);
  return <GuardedDialog title={`Паром ${ferry.name} — движение судна`} onClose={onClose} className="sending-ferry-dialog">
    <header className="sending-ferry-dialog__header">
      <h2>{ferry.name} · Движение судна</h2>
      <div>
        <button type="button" className="sending-ferry-dialog__icon" disabled={loading} aria-label="Обновить положение судна" title="Обновить" onClick={() => setRefresh(n => n + 1)}>
          {loading ? <Loader2 size={20} className="animate-spin" /> : <RotateCw size={20} />}
        </button>
        <button type="button" className="sending-ferry-dialog__icon" aria-label="Закрыть карту парома" title="Закрыть" onClick={onClose}><X size={22} /></button>
      </div>
    </header>
    <p className="sending-ferry-dialog__hint">Последние данные Marinesia · MMSI {ferry.mmsi}</p>
    {loading && !vessel && <p role="status">Загружаем положение судна…</p>}
    {error && <p role="alert" className="sending-ferry-dialog__error">{error}</p>}
    {vessel && <VesselInfoPanel vesselInfo={vessel} />}
  </GuardedDialog>;
}
