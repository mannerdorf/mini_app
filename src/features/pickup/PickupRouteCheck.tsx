import React, { useEffect, useRef, useState } from "react";
import { Route as RouteIcon, X } from "lucide-react";
import type { Route, Job, Snapshot } from "../../../lib/pickup/model";
import type { DgisDebugEntry } from "../../../lib/pickup/dgisRouteError";
import {
  timeLabel,
  type Assessment,
  type AnalysisResult,
} from "../../../lib/pickup/routeAnalysis";
import type { PickupCall } from "./client";
import { PickupRouteComparisonMap } from "./PickupRouteComparisonMap";
import { dgisRouteCheckWarnings } from "./pickupRouteCheckDgis";

const duration = (n: number) =>
  `${Math.floor(Math.ceil(n) / 60)} ч ${Math.ceil(n) % 60} мин`;

export function PickupRouteCheck({
  route,
  jobs,
  snapshot,
  call,
  busy,
  stale,
  onApply,
}: {
  route: Route;
  jobs: Job[];
  snapshot: Snapshot;
  call: PickupCall;
  busy: boolean;
  stale: boolean;
  onApply: (result: AnalysisResult) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy || stale || route.status === "completed"}
        onClick={() => setOpen(true)}
      >
        <RouteIcon size={18} />
        2ГИС
      </button>
      {open && (
        <CheckDialog
          key={route.id}
          {...{ route, jobs, snapshot, call, busy, stale, onApply }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CheckDialog({
  route,
  jobs,
  snapshot,
  call,
  busy,
  stale,
  onApply,
  onClose,
}: {
  route: Route;
  jobs: Job[];
  snapshot: Snapshot;
  call: PickupCall;
  busy: boolean;
  stale: boolean;
  onApply: (result: AnalysisResult) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    sequence = useRef(0);
  const [result, setResult] = useState<AnalysisResult>(),
    [checking, setChecking] = useState(false),
    [error, setError] = useState(""),
    [map, setMap] = useState(false),
    [base, setBase] = useState(""),
    [clock, setClock] = useState(Date.now());
  const [confirmedRevision, setConfirmedRevision] = useState("");
  const revision = JSON.stringify([
    route,
    route.status === "started"
      ? snapshot.locations?.find((l) => l.route_id === route.id)
      : null,
    jobs.map((j) => [j.id, j.version, j.status, j.position]),
    snapshot.resources.filter((r) =>
      [route.driver_id, route.vehicle_id, route.depot_id].includes(r.id),
    ),
  ]);
  const outdated =
    !!result &&
    (base !== revision || clock - Date.parse(result.checkedAt) > 10 * 60000);
  const windowsConfirmed = confirmedRevision === revision;
  useEffect(() => {
    dialog.current?.showModal();
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => {
      clearInterval(timer);
      sequence.current++;
    };
  }, []);
  const check = async () => {
    const seq = ++sequence.current;
    setChecking(true);
    setError("");
    setResult(undefined);
    setMap(false);
    try {
      const response = await call<AnalysisResult>({
        action: "check_route",
        id: route.id,
        version: route.version,
        startAddress: "",
        windowsConfirmed,
      });
      if (seq === sequence.current) {
        setResult(response);
        setBase(revision);
        setClock(Date.now());
      }
    } catch (e) {
      if (seq === sequence.current)
        setError(
          e instanceof Error ? e.message : "Не удалось проверить маршрут",
        );
    } finally {
      if (seq === sequence.current) setChecking(false);
    }
  };
  const apply = async () => {
    if (!result || outdated) return;
    setError("");
    try {
      if (await onApply(result)) onClose();
      else
        setError(
          "Не удалось применить порядок. Повторите расчёт через 2ГИС.",
        );
    } catch {
      setError("Не удалось применить порядок. Повторите расчёт через 2ГИС.");
    }
  };

  const dgisWarnings = result ? dgisRouteCheckWarnings(result.warnings) : [];
  const dgisFailed = !!result && !result.current;

  return (
    <dialog ref={dialog} className="pk-form pk-route-check" onCancel={onClose}>
      <div className="pk-section-heading">
        <h2>2ГИС</h2>
        <button type="button" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      </div>
      <ul className="pk-check-stops">{jobs.map(job => <li key={job.id}>
        <strong>{job.data.senderName}</strong>
        <span>Окно забора: {job.data.windowFrom}–{job.data.windowTo}</span>
        <span>Часы отправителя: {job.data.warehouseHours || "Не указаны"}</span>
      </li>)}</ul>
      <label><input type="checkbox" checked={windowsConfirmed} disabled={checking}
        onChange={event => { setConfirmedRevision(event.target.checked ? revision : ""); setResult(undefined); }} />
        Я сверил окна забора с часами отправителей и перерывами на выбранную дату
      </label>
      {!windowsConfirmed && <p className="pk-hint">Без подтверждения окон оценка будет неполной. При изменении маршрута подтверждение сбрасывается.</p>}
      <button
        type="button"
        className="pk-primary"
        disabled={checking || busy || stale}
        onClick={() => void check()}
      >
        {checking ? "Запрос к 2ГИС…" : "Рассчитать через 2ГИС"}
      </button>
      {checking && (
        <p className="pk-hint" role="status">
          До минуты на ответ 2ГИС.
        </p>
      )}
      {error && (
        <p className="pk-warning" role="alert">
          {error}
        </p>
      )}
      {result && dgisFailed && (
        <div className="pk-dgis-only-result" role="status">
          {dgisWarnings.length > 0 && (
            <ul className="pk-check-warnings">
              {dgisWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {result.dgisDebug?.length ? (
            <DgisDebugBody entries={result.dgisDebug} />
          ) : (
            !dgisWarnings.length && (
              <p className="pk-muted">2ГИС не вернул результат. Повторите расчёт.</p>
            )
          )}
        </div>
      )}
      {result?.current && (
        <>
          <div
            className={`pk-route-verdict pk-route-verdict--${outdated ? "gray" : result.status}`}
            role="status"
          >
            <strong>
              {outdated
                ? "Расчёт устарел — повторите через 2ГИС"
                : result.message}
            </strong>
          </div>
          <p className="pk-hint">
            {result.originLabel}
            <br />
            Старт:{" "}
            {new Date(result.departure).toLocaleString("ru-RU", {
              timeZone:
                route.city === "moscow"
                  ? "Europe/Moscow"
                  : "Europe/Kaliningrad",
            })}{" "}
            ·{" "}
            {result.traffic === "jam"
              ? "текущие пробки на старте; далее прогноз на время выезда с каждой точки"
              : "статистика движения на время выезда с каждой точки"}
          </p>
          <p className="pk-hint">Время уточнено с учётом ожидания и погрузки. Это прогноз: дорожная обстановка может измениться. Линии на карте рассчитаны на время старта.</p>
          <div className="pk-check-columns">
            <AssessmentCard
              title="Текущий порядок"
              value={result.current}
              jobs={jobs}
            />
            {result.proposed && (
              <AssessmentCard
                title="Предложенный порядок"
                value={result.proposed}
                jobs={jobs}
              />
            )}
          </div>
          {result.proposed &&
            !result.current.unreachable &&
            !result.proposed.unreachable && (
              <p className="pk-check-saving">
                Изменение:{" "}
                {(result.current.km - result.proposed.km).toFixed(1)} км и{" "}
                {Math.round(result.current.minutes - result.proposed.minutes)}{" "}
                мин.
              </p>
            )}
          <button type="button" onClick={() => setMap(!map)}>
            {map ? "Скрыть карту" : "Сравнить на карте"}
          </button>
          {map && <PickupRouteComparisonMap result={result} />}
          {result.ids && (
            <button
              type="button"
              className="pk-primary"
              disabled={
                busy ||
                checking ||
                stale ||
                outdated ||
                !!result.proposed?.unreachable
              }
              onClick={() => void apply()}
            >
              Применить порядок
            </button>
          )}
        </>
      )}
    </dialog>
  );
}

function DgisDebugBody({ entries }: { entries: DgisDebugEntry[] }) {
  return (
    <div className="pk-dgis-only-debug">
      {entries.map((entry, index) => (
        <section key={`${entry.service}-${entry.httpStatus}-${index}`}>
          <p className="pk-muted">
            {entry.service === "geocode" ? "Геокодер" : "Маршрутизация"} · HTTP{" "}
            {entry.httpStatus}
          </p>
          <pre className="pk-dgis-debug-body">
            {JSON.stringify(entry.responseBody, null, 2)}
          </pre>
        </section>
      ))}
    </div>
  );
}

function AssessmentCard({
  title,
  value,
  jobs,
}: {
  title: string;
  value: Assessment;
  jobs: Job[];
}) {
  return (
    <section className="pk-panel">
      <h3>{title}</h3>
      <strong>
        {value.unreachable
          ? "Есть недоступные участки"
          : `${value.km.toFixed(1)} км · ${duration(value.minutes)}`}
      </strong>
      <p>
        Склад: {value.unreachable ? "—" : timeLabel(value.finish)}
        {!value.unreachable && <> · ожидание {Math.round(value.waiting)} мин</>}
      </p>
      {!!value.unreachable && (
        <p className="pk-warning">
          Нет проезда на {value.unreachable} участках.
        </p>
      )}
      {!value.unreachable && !!value.lateStops && (
        <p className="pk-warning">Опоздание на {value.lateStops} точках</p>
      )}
      {!value.unreachable && !!value.depotLate && (
        <p className="pk-warning">
          Склад закрывается раньше на {Math.ceil(value.depotLate)} мин
        </p>
      )}
      {!value.unreachable && !!value.shiftLate && (
        <p className="pk-warning">
          Выход за смену на {Math.ceil(value.shiftLate)} мин
        </p>
      )}
      <ol className="pk-check-stops">
        {value.visits.map((v) => {
          const job = jobs.find((j) => j.id === v.id);
          return (
            <li key={v.id}>
              <strong>{job?.data.senderName}</strong>
              <span>{job?.data.address}</span>
              <small>
                {value.unreachable ? (
                  "Нет прогноза"
                ) : (
                  <>
                    {timeLabel(v.arrival)} → {timeLabel(v.departure)} ·{" "}
                    {job?.data.windowFrom}–{job?.data.windowTo}
                  </>
                )}
              </small>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
