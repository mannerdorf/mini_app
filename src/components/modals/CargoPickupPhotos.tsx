import { createPortal } from "react-dom";
import { GuardedDialog } from "../GuardedDialog";
import { useEffect, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import type { AuthData, CargoItem } from "../../types";
import { perevozkiCustomerInn } from "../../../lib/perevozkiPartyMatch";

type Photo = { id: string; content_type: string; base64: string };
export function CargoPickupPhotos({ item, auth }: { item: CargoItem; auth: AuthData }) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPhotos([]);
    fetch("/api/cargo-pickup-photos", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ login: auth.login, password: auth.password, number: String(item.rawNumber ?? item.Number ?? ""), customerInn: perevozkiCustomerInn(item) }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить фотографии");
      if (!controller.signal.aborted) setPhotos(Array.isArray(data.photos) ? data.photos : []);
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(reason.message || "Не удалось загрузить фотографии");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, attempt, auth.login, auth.password, item]);
  return <>
    <button type="button" className="cargo-pickup-photo-button" aria-label={open ? "Скрыть фото забора" : "Показать фото забора от водителя"} title="Фото забора от водителя" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Camera size={20} aria-hidden="true" />
    </button>
    {open && createPortal(<GuardedDialog title="Фото забора от водителя" onClose={() => setOpen(false)} className="modal-overlay">
      <div className="modal-content" style={{ width: "min(92vw, 900px)", maxWidth: "900px" }} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2>Фото забора от водителя</h2><button type="button" className="filter-button" onClick={() => setOpen(false)}>Закрыть</button></div>
      <div className="cargo-pickup-photo-gallery">
      {loading && <span role="status"><Loader2 size={18} aria-hidden="true" /> Загрузка фотографий…</span>}
      {error && <div role="alert">{error} <button type="button" onClick={() => setAttempt(attempt + 1)}>Повторить</button></div>}
      {!loading && !error && photos.length === 0 && <span>Фотографии не найдены</span>}
      {photos.filter((photo) => ["image/jpeg", "image/png", "image/webp"].includes(photo.content_type)).map((photo, index) =>
        <img key={photo.id} src={`data:${photo.content_type};base64,${photo.base64}`} alt={`Фото забора ${index + 1}`} />)}
    </div></div></GuardedDialog>, document.body)}
  </>;
}
