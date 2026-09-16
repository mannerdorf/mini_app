import React, { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { plannedPlaces, type Job } from "../../../lib/pickup/model";
import { pickupSiteInstructionsDisplay } from "../../../lib/pickup/jobSiteInstructions";
import { Field, Textarea } from "./Forms";
import { preparePhoto } from "./client";

const navUrl = (address: string) =>
  `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}&rtt=auto`;

type ActBody = Record<string, unknown> & { action: string; id: string; version: number };

type Props = {
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

type PickupStep = "arrive" | "pickup_places" | "pickup_photos" | "pickup_confirm" | "problem";

export function PickupDriverJobFlow({
  job,
  stopIndex,
  stopTotal,
  busy,
  act,
}: Props) {
  const planned = plannedPlaces(job.data);
  const [step, setStep] = useState<PickupStep>(() =>
    job.status === "arrived" ? "pickup_places" : "arrive",
  );
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStep(job.status === "arrived" ? "pickup_places" : "arrive");
    setActual("");
    setNote("");
    setPhotos([]);
    setError("");
  }, [job.id, job.status, job.version]);

  useEffect(() => {
    if (step === "pickup_places" && !actual) {
      setActual(String(planned));
    }
  }, [step, actual, planned]);

  const navTarget =
    job.data.latitude !== null && job.data.longitude !== null
      ? `${job.data.latitude},${job.data.longitude}`
      : job.data.address;

  const instructions = pickupSiteInstructionsDisplay(job.data.instructions);

  return (
    <section className="pk-driver-mobile-step" aria-live="polite">
      <p className="pk-eyebrow">
        Точка {stopIndex + 1} из {stopTotal} · {job.data.windowFrom}–{job.data.windowTo}
      </p>
      <h2 className="pk-driver-mobile-step__title">{job.data.senderName}</h2>
      <p className="pk-driver-mobile-step__address">{job.data.address}</p>

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
                "Проблема передана диспетчеру",
                true,
              )
            }
          >
            Отправить диспетчеру
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

      {error ? (
        <p className="pk-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
