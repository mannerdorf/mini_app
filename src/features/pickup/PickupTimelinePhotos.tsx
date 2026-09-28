import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import type { PickupCall } from "./client";

export function PickupTimelinePhotos({ id, count, call }: { id: string; count: number; call: PickupCall }) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(""); setPhotos([]);
    call<{ photos: { content_type: string; base64: string }[] }>({ action: "photos", id })
      .then((result) => {
        if (!cancelled) setPhotos(result.photos.map((p) => `data:${p.content_type};base64,${p.base64}`));
      })
      .catch((e) => { if (!cancelled) setError(e.message || "Не удалось загрузить фото"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, id, call, attempt]);
  return <div className="pk-timeline-photos">
    <button type="button" className="pk-icon-btn" aria-label={`Фото забора: ${count}`} title={`Фото забора (${count})`} aria-expanded={open} onClick={() => setOpen(!open)}>
      <Camera size={18} aria-hidden="true" /><span>{count}</span>
    </button>
    {open && <div>
      {loading && <p role="status">Загрузка фотографий…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => setAttempt(attempt + 1)}>Повторить</button></p>}
      {!loading && !error && photos.length === 0 && <p>Фотографии не найдены</p>}
      <div className="pk-photos">{photos.map((src, i) => <a key={src} href={src} download={`pickup-${id}-${i + 1}.jpg`}><img src={src} alt={`Фото забора ${i + 1}`} /></a>)}</div>
    </div>}
  </div>;
}
