import React from "react";
import { PickupStopOrder } from "./PickupStopOrder";
import { routeStartAddress, statusLabels } from "../../../lib/pickup/model";
import { cities, type City, type Job, type Route } from "../../../lib/pickup/model";
import { PickupRouteStatusBadge } from "./PickupRouteStatusBadge";
import { PickupDeposit } from "./PickupDeposit";
import { PickupDriverLocation } from "./PickupDriverLocation";
import { PickupDriverJobFlow } from "./PickupDriverJobFlow";
import {
  driverMobilePhase,
  driverStopProgress,
  jobsAwaitingDispatcher,
} from "./driverMobileFlow";
import { canDepositJobs, currentDriverJob } from "./operations";
import type { PickupCall } from "./client";

type ActBody = Record<string, unknown> & { action: string; id: string; version: number };

type Props = {
  onDraftChange?: (dirty: boolean) => void;
  draftDirty?: boolean;
  route: Route;
  routeJobs: Job[];
  city: City;
  busy: boolean;
  error: string;
  stale: boolean;
  outboxCount: number;
  outboxReady: boolean;
  routePending: boolean;
  driverCanOperate: boolean;
  call: PickupCall;
  locationAvailable: boolean;
  onSync: () => void;
  onStartRoute: () => void;
  onAckRoute: () => void;
  act: (
    body: ActBody,
    ok: string,
    queue?: boolean,
  ) => Promise<boolean>;
};

export function PickupDriverMobileRoute({
  route,
  onDraftChange,
  draftDirty = false,
  routeJobs,
  city,
  busy,
  error,
  stale,
  outboxCount,
  outboxReady,
  routePending,
  driverCanOperate,
  call,
  locationAvailable,
  onSync,
  onStartRoute,
  onAckRoute,
  act,
}: Props) {
  const phase = driverMobilePhase(route, routeJobs, { outboxCount });
  const { closed, total } = driverStopProgress(routeJobs);
  const current = currentDriverJob(routeJobs);
  const currentIndex = current ? routeJobs.findIndex((j) => j.id === current.id) : -1;
  const waiting = jobsAwaitingDispatcher(routeJobs);

  const blocked =
    busy ||
    routePending ||
    !outboxReady ||
    !driverCanOperate ||
    (route.status === "started" && route.acknowledged_version !== route.version);

  return (
    <section className="pk-panel pk-route-detail pk-driver-mobile-route">
      <header className="pk-driver-mobile-route__head">
        <p className="pk-eyebrow">
          {cities[city]} · {route.date}
        </p>
        <h2>{route.name}</h2>
        <p className="pk-route-meta pk-route-meta--compact">
          <PickupRouteStatusBadge status={route.status} /> · {route.start_time}
        </p>
        <div className="pk-driver-progress pk-driver-progress--bar">
          <progress value={closed} max={Math.max(1, total)} aria-label="Прогресс маршрута" />
          <span>
            {closed} / {total} точек
          </span>
        </div>
        {stale ? (
          <p className="pk-warning pk-driver-mobile-route__stale">
            Офлайн-копия. Нажмите «Обновить» в шапке.
          </p>
        ) : null}
      </header>

      <details className="pk-driver-itinerary">
        <summary>Все остановки · {total}</summary>
        <p className="pk-hint">Старт: {routeStartAddress(route) || "Склад HAULZ"}</p>
        <ol>{routeJobs.map((job) => <li key={job.id}><strong>{job.data.senderName}</strong><span>{job.data.address}</span><span>{job.data.windowFrom}–{job.data.windowTo} · {statusLabels[job.status]}</span></li>)}</ol>
        <p><strong>Финиш: {route.snapshot.depot?.name || "Склад HAULZ"}</strong><br />{route.snapshot.depot?.data.address}</p>
        <PickupStopOrder route={route} jobs={routeJobs} busy={busy} error={error} disabled={blocked || draftDirty || stale || outboxCount > 0 || route.status === "completed"} onSave={async (ids, version) => Boolean(await act({ action: "reorder", id: route.id, version, ids, asDriver: true }, "Порядок точек сохранён"))} />
      </details>
      {route.status === "started" && driverCanOperate && <details className="pk-driver-itinerary"><summary>Передача GPS диспетчеру</summary><PickupDriverLocation key={route.id} routeId={route.id} available={locationAvailable} call={call} /></details>}
      {phase === "sync" && (
        <section className="pk-driver-mobile-step">
          <h2 className="pk-driver-mobile-step__title">Отправьте сохранённые отметки</h2>
          <p className="pk-hint">
            На устройстве {outboxCount} отметок. Сначала синхронизация — затем следующий шаг
            маршрута.
          </p>
          <button
            type="button"
            className="pk-primary pk-driver-mobile-cta"
            disabled={busy}
            onClick={onSync}
          >
            Отправить отметки
          </button>
        </section>
      )}

      {phase === "published" && driverCanOperate && (
        <section className="pk-driver-mobile-step">
          <h2 className="pk-driver-mobile-step__title">Маршрут готов</h2>
          <p className="pk-hint">
            {total} {total === 1 ? "точка" : total < 5 ? "точки" : "точек"}. Проверьте дату и
            нажмите старт — порядок остановок задан диспетчером.
          </p>
          <button
            type="button"
            className="pk-primary pk-driver-mobile-cta"
            disabled={blocked}
            onClick={onStartRoute}
          >
            Маршрут проверен — начать
          </button>
        </section>
      )}

      {phase === "ack" && driverCanOperate && (
        <section className="pk-driver-mobile-step">
          <h2 className="pk-driver-mobile-step__title">Маршрут обновлён</h2>
          <p className="pk-hint">
            Диспетчер изменил состав или порядок. Подтвердите, что ознакомились — затем
            продолжите работу.
          </p>
          <button
            type="button"
            className="pk-primary pk-driver-mobile-cta"
            disabled={busy || routePending}
            onClick={onAckRoute}
          >
            Ознакомился с маршрутом
          </button>
        </section>
      )}

      {phase === "on_stop" && current && (
        <>
          <PickupDriverJobFlow
            onDraftChange={onDraftChange}
            job={current}
            stopIndex={currentIndex}
            stopTotal={total}
            busy={blocked}
            act={act}
          />
        </>
      )}

      {phase === "wait_dispatcher" && (
        <section className="pk-driver-mobile-step">
          <h2 className="pk-driver-mobile-step__title">Ждём диспетчера</h2>
          <p className="pk-hint">
            {waiting.length === 1
              ? "По одной точке нужно решение диспетчера перед продолжением."
              : `Точек с ожиданием: ${waiting.length}. Продолжить маршрут можно после решения.`}
          </p>
          <ul className="pk-driver-mobile-wait-list">
            {waiting.map((j) => (
              <li key={j.id}>
                <strong>{j.data.senderName}</strong>
                <span>{j.note || j.resolution || "Ожидает решения"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {phase === "deposit" && driverCanOperate && (
        <section className="pk-driver-mobile-step">
          <h2 className="pk-driver-mobile-step__title">Сдача на склад</h2>
          <p className="pk-hint">Все заборы закрыты. Подтвердите передачу груза на склад HAULZ.</p>
          <p>{route.snapshot.depot?.data.address}</p>
          <a className="pk-driver-mobile-nav" href={`https://yandex.ru/maps/?rtext=~${encodeURIComponent(route.snapshot.depot?.data.address || "")}&rtt=auto`} target="_blank" rel="noreferrer">Навигация до склада</a>
          <PickupDeposit
            onDraftChange={onDraftChange}
            key={route.id}
            jobs={routeJobs}
            busy={busy}
            error={error}
            disabled={blocked || !canDepositJobs(routeJobs)}
            autoOpen
            onConfirm={(numbers) =>
              act(
                {
                  action: "deposit",
                  id: route.id,
                  version: route.version,
                  zayavka_numbers: numbers,
                },
                "Грузы сданы на склад",
                true,
              )
            }
          />
        </section>
      )}

      {phase === "completed" && (
        <section className="pk-driver-mobile-step pk-driver-mobile-step--done">
          <h2 className="pk-driver-mobile-step__title">Маршрут завершён</h2>
          <p className="pk-hint">Спасибо. Все точки закрыты, данные сохранены.</p>
        </section>
      )}
    </section>
  );
}
