import { draftKey, type PickupStep } from "./driverDraft";
import { useDriverDraft } from "./useDriverDraft";
import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { plannedPlaces, type Job } from "../../../lib/pickup/model";
import { pickupSiteInstructionsDisplay } from "../../../lib/pickup/jobSiteInstructions";
import { Field, Textarea } from "./Forms";
import { PickupJobNumber } from "./PickupJobNumber";
import { preparePhoto } from "./client";

const navUrl = (address: string) =>
  `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}&rtt=auto`;

type ActBody = Record<string, unknown> & { action: string; id: string; version: number };

type Props = {
  driverLogin: string;
  onDraftChange?: (dirty: boolean) => void;
  job: Job;
  stopIndex: number;
  stopTotal: number;
  busy: boolean;
  act: (
    body: ActBody,
    ok: string,
    queue?: boolean,
  ) => Promise<boolean | void>;
};


export function PickupDriverJobFlow({
  driverLogin,
  job,
  onDraftChange,
  stopIndex,
  stopTotal,
  busy: parentBusy,
  act: parentAct,
}: Props) {
  const planned = plannedPlaces(job.data);
  const store = useDriverDraft(draftKey(driverLogin, job.id), {
    actual: "", note: "", photos: [], version: job.version,
    step: job.status === "arrived" ? "pickup_places" : "arrive",
  });
  const { step, actual, note, photos } = store.draft;
  const setStep = (value: PickupStep) => store.update("step", value);
  const setActual = (value: string) => store.update("actual", value);
  const setNote = (value: string) => store.update("note", value);
  const setPhotos = (value: string[] | ((old: string[]) => string[])) => store.update("photos", value);
  const changed = store.dirty && store.draft.version !== job.version;
  const busy = parentBusy || !store.ready || store.clearing || changed;
  const act: Props["act"] = async (body, title, queue) => {
    const accepted = await parentAct(body, title, queue);
    if (accepted && (body.action === "complete" || body.action === "problem")) {
      try { await store.clear(); }
      catch { setError("Отметка отправлена, но старый черновик не удалось удалить с устройства."); }
    }
    return accepted;
  };
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onDraftChange?.(!store.ready || store.dirty || photoBusy);
  }, [store.ready, store.dirty, photoBusy, onDraftChange]);
  useEffect(() => () => onDraftChange?.(false), [onDraftChange]);

  useEffect(() => {
    if (!store.ready) return;
    if (job.status === "arrived" && step === "arrive") setStep("pickup_places");
  }, [store.ready, job.status, step]);

  const navTarget =
    job.data.latitude !== null && job.data.longitude !== null
      ? `${job.data.latitude},${job.data.longitude}`
      : job.data.address;

  const instructions = pickupSiteInstructionsDisplay(job.data.instructions);

  if (!store.ready) return <p role="status">Восстанавливаем черновик точки…</p>;

  return (
    <section className="pk-driver-mobile-step" aria-live="polite">
      <PickupJobNumber job={job} prominent />
      <p className="pk-eyebrow">
        Точка {stopIndex + 1} из {stopTotal} · {job.data.windowFrom}–{job.data.windowTo}
      </p>
      <h2 className="pk-driver-mobile-step__title">{job.data.senderName}</h2>
      <p className="pk-driver-mobile-step__address">{job.data.address}</p>

      {store.storageError && <p className="pk-warning" role="alert">{store.storageError}</p>}
      {store.needsReview && <p className="pk-warning">Старый черновик: проверьте дату и данные перед отправкой. Фото сохранены; удаление доступно только по вашему подтверждению.</p>}
      {store.dirty && !store.storageError && <p role="status" className="pk-hint">{store.saving ? "Сохраняем черновик…" : "Черновик сохранён на этом устройстве"}</p>}
      {store.dirty && <button type="button" className="pk-driver-mobile-link" disabled={parentBusy || photoBusy || store.clearing} onClick={() => {
        if (window.confirm("Удалить введённые места, комментарий и фотографии этой точки?")) {
          void store.clear().catch(() => setError("Не удалось удалить черновик. Попробуйте ещё раз."));
        }
      }}>Удалить черновик</button>}
      {changed && <div className="pk-warning" role="alert">
        <p>Диспетчер обновил точку. Ваш ввод сохранён. Проверьте адрес, груз и документы перед отправкой.</p>
        <button type="button" disabled={parentBusy} onClick={() => store.update("version", job.version)}>Проверил изменения — продолжить</button>
      </div>}
      <div className="pk-driver-contact-actions">
        {job.data.contacts.filter((c) => c.phone).map((c, index) => <a key={index} href={`tel:${c.phone.replace(/[^+0-9]/g, "")}`} className="pk-driver-contact-link">Позвонить: {c.name || "отправитель"}{c.extension ? ` · доб. ${c.extension}` : ""}</a>)}
      </div>
      <details className="pk-driver-itinerary"><summary>Груз и документы</summary>
        <p>{planned} мест · {job.data.weightKg ?? "—"} кг · {job.data.volumeM3 ?? "—"} м³</p>
        <p>Склад: {job.data.warehouseHours || `${job.data.windowFrom}–${job.data.windowTo}`}</p>
        {job.data.documents.map((d, i) => <p key={i}>Счёт {d.number}{d.date ? ` от ${d.date}` : ""}</p>)}
        {job.data.requirements && <p>{job.data.requirements}</p>}
      </details>
      <fieldset disabled={busy || photoBusy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {step === "arrive" && (
        <div className="pk-driver-mobile-step__body">
          {instructions ? <p className="pk-instructions">{instructions}</p> : null}
          <a
            className="pk-driver-mobile-nav"
            href={navUrl(navTarget)}
            target="_blank"
            rel="noreferrer"
          >
            Открыть навигацию
          </a>
          <button
            type="button"
            className="pk-primary pk-driver-mobile-cta"
            disabled={busy}
            onClick={() =>
              void act(
                { action: "arrive", id: job.id, version: job.version },
                "Прибыл на точку",
                true,
              )
            }
          >
            Прибыл на точку
          </button>
        </div>
      )}

      {step === "pickup_places" && (
        <div className="pk-driver-mobile-step__body">
          <p className="pk-hint">План: {planned} мест</p>
          <button type="button" disabled={busy} onClick={() => setActual(String(planned))}>Забрано по плану: {planned}</button>
          <Field
            label="Фактически забрано мест"
            type="number"
            min="1"
            step="1"
            value={actual}
            onChange={setActual}
          />
          <button
            type="button"
            className="pk-primary pk-driver-mobile-cta"
            disabled={
              busy ||
              !Number.isInteger(Number(actual)) ||
              Number(actual) <= 0
            }
            onClick={() => setStep("pickup_photos")}
          >
            Далее — фото груза
          </button>
          <button
            type="button"
            className="pk-driver-mobile-link"
            disabled={busy}
            onClick={() => setStep("problem")}
          >
            Не удалось забрать
          </button>
        </div>
      )}

      {step === "pickup_photos" && (
        <div className="pk-driver-mobile-step__body">
          <p className="pk-hint">Сделайте фото груза (до 3). Без фото продолжить нельзя.</p>
          <label className="pk-field pk-driver-mobile-file">
            <span>Добавить фото</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={photoBusy || busy}
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                setPhotoBusy(true);
                setError("");
                try {
                  if (photos.length + files.length > 3) {
                    throw new Error("Можно приложить до 3 фото");
                  }
                  const ready = await Promise.all(files.map(preparePhoto));
                  setPhotos((p) => [...p, ...ready]);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
          </label>
          {photoBusy ? <p className="pk-hint">Подготовка фото…</p> : null}
          <div className="pk-photos pk-photos--mobile">
            {photos.map((src, i) => (
              <div key={i}>
                <img src={src} alt={`Фото ${i + 1}`} />
                <button
                  type="button"
                  className="pk-delete-icon"
                  aria-label="Удалить фото"
                  disabled={busy}
                  onClick={() => setPhotos((p) => p.filter((_, n) => n !== i))}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          {Number(actual) !== planned ? (
            <Textarea
              label="Причина расхождения с планом — обязательно"
              value={note}
              onChange={setNote}
            />
          ) : (
            <Textarea
              label="Комментарий (необязательно)"
              value={note}
              onChange={setNote}
            />
          )}
          <button
            type="button"
            className="pk-primary pk-driver-mobile-cta"
            disabled={
              busy ||
              photoBusy ||
              !photos.length ||
              (Number(actual) !== planned && !note.trim())
            }
            onClick={() => setStep("pickup_confirm")}
          >
            Далее — подтверждение
          </button>
        </div>
      )}

      {step === "pickup_confirm" && (
        <div className="pk-driver-mobile-step__body">
          <p>
            Забрано <strong>{actual}</strong> мест · фото: {photos.length}
          </p>
          <button
            type="button"
            className="pk-primary pk-driver-mobile-cta"
            disabled={busy || photoBusy || !photos.length}
            onClick={() =>
              void act(
                {
                  action: "complete",
                  id: job.id,
                  version: job.version,
                  actual_places: Number(actual),
                  note,
                  photos,
                },
                "Выполнил — груз забран",
                true,
              )
            }
          >
            Подтвердить: груз забран
          </button>
          <button
            type="button"
            className="pk-driver-mobile-link"
            disabled={busy}
            onClick={() => setStep("pickup_photos")}
          >
            Назад к фото
          </button>
        </div>
      )}

      {step === "problem" && (
        <div className="pk-driver-mobile-step__body">
          <Textarea
            label="Что помешало забрать груз?"
            value={note}
            onChange={setNote}
          />
          <button
            type="button"
            className="pk-btn-danger pk-driver-mobile-cta"
            disabled={busy || !note.trim()}
            onClick={() =>
              void act(
                {
                  action: "problem",
                  id: job.id,
                  version: job.version,
                  note,
                },
                "Результат по точке сохранён",
                true,
              )
            }
          >
            Зафиксировать и продолжить
          </button>
          <button
            type="button"
            className="pk-driver-mobile-link"
            disabled={busy}
            onClick={() => setStep("pickup_places")}
          >
            Вернуться к забору
          </button>
        </div>
      )}

      </fieldset>
      {error ? (
        <p className="pk-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
