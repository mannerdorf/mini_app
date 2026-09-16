import { routeStartAddress } from "../../../lib/pickup/model";
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
        Проверить маршрут
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
    [dgisDebugOpen, setDgisDebugOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [address, setAddress] = useState(""),
    [base, setBase] = useState(""),
    [clock, setClock] = useState(Date.now());
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
  const signature = JSON.stringify([revision, address, confirmed]);
  const outdated =
    !!result &&
    (base !== signature || clock - Date.parse(result.checkedAt) > 10 * 60000);
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
    const initial = signature;
    try {
      const response = await call<AnalysisResult>({
        action: "check_route",
        id: route.id,
        version: route.version,
        startAddress: address.trim(),
        windowsConfirmed: confirmed,
      });
      if (seq === sequence.current) {
        setResult(response);
        setBase(initial);
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
          "Не удалось применить порядок. Проверьте сообщение и повторите расчёт.",
        );
    } catch {
      setError("Не удалось применить порядок. Повторите проверку маршрута.");
    }
  };
  return (
    <dialog ref={dialog} className="pk-form pk-route-check" onCancel={onClose}>
      <div className="pk-section-heading">
        <h2>Проверить маршрут</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть проверку маршрута"
        >
          <X size={20} />
        </button>
      </div>
      <p className="pk-hint">
        {route.name} · {route.date} ·{" "}
        {route.status === "started"
          ? "Проверяем оставшиеся заборы от текущего положения или последней отмеченной остановки"
          : `Старт: ${routeStartAddress(route, snapshot.resources.find((r) => r.id === route.depot_id)) || "Склад HAULZ"}. Финиш — склад HAULZ`}
        . Переставляются только незапущенные точки.
      </p>
      <label>
        Другой адрес только для этого расчёта (необязательно)
        <input
          value={address}
          maxLength={1000}
          onChange={(e) => setAddress(e.target.value)}
          disabled={checking}
          placeholder="Оставьте пустым для указанного выше начала"
        />
      </label>
      <label className="pk-check-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={checking}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Окна забора учитывают график, перерывы и выходные отправителей; время
        погрузки проверено.
      </label>
      <button
        type="button"
        className="pk-primary"
        disabled={checking || busy || stale}
        onClick={() => void check()}
      >
        {checking ? "Рассчитываем время и варианты…" : "Рассчитать через 2ГИС"}
      </button>
      {checking && (
        <p className="pk-hint" role="status">
          Проверка до 20 точек может занять около минуты. Можно продолжить
          работу после закрытия окна.
        </p>
      )}
      {error && (
        <p className="pk-warning" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <div
            className={`pk-route-verdict pk-route-verdict--${outdated ? "gray" : result.status}`}
            role="status"
          >
            <strong>
              {outdated
                ? "Расчёт устарел — повторите проверку"
                : result.message}
            </strong>
          </div>
          <ul className="pk-check-warnings">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {!!result.dgisDebug?.length && (
            <>
              <button
                type="button"
                className="pk-dgis-debug-open"
                onClick={() => setDgisDebugOpen(true)}
              >
                Ответ 2ГИС — подробности
              </button>
              {dgisDebugOpen && (
                <DgisDebugDialog
                  entries={result.dgisDebug}
                  onClose={() => setDgisDebugOpen(false)}
                />
              )}
            </>
          )}
          {result.current && (
            <>
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
                  ? "текущие пробки"
                  : "статистика движения на время старта"}
              </p>
              <p className="pk-hint">
                Оценка по дорожной обстановке на время старта: пробки в течение
                дня могут измениться. Погрузка должна закончиться до закрытия
                окна. Финиш — прибытие на склад; разгрузка не включена. Поиск
                улучшения не гарантирует глобально оптимальный порядок.
              </p>
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
                    {Math.round(
                      result.current.minutes - result.proposed.minutes,
                    )}{" "}
                    мин экономии. Отрицательное значение означает увеличение
                    ради соблюдения окон.
                  </p>
                )}
              <button type="button" onClick={() => setMap(!map)}>
                {map ? "Скрыть карту" : "Сравнить на карте"}
              </button>
              {map && (
                <>
                  <p className="pk-hint">
                    Синий — текущий, фиолетовый пунктир — предложенный. Т / П —
                    номера точек. Дорожная геометрия 2ГИС; подложка
                    OpenStreetMap.
                  </p>
                  <PickupRouteComparisonMap result={result} />
                </>
              )}
            </>
          )}
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
          <p className="pk-hint">
            Проверено: {new Date(result.checkedAt).toLocaleTimeString("ru-RU")}.
            Применение изменяет только порядок, без автоматического старта
            рейса.
          </p>
        </>
      )}
    </dialog>
  );
}
function DgisDebugDialog({
  entries,
  onClose,
}: {
  entries: DgisDebugEntry[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="pk-form pk-dgis-debug-dialog"
      onCancel={onClose}
    >
      <div className="pk-section-heading">
        <h3>Ответ 2ГИС</h3>
        <button type="button" onClick={onClose} aria-label="Закрыть">
          <X size={20} />
        </button>
      </div>
      <p className="pk-hint">
        Технические данные для диагностики. Ключ API не передаётся.
      </p>
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
      <button type="button" className="pk-primary" onClick={onClose}>
        Закрыть
      </button>
    </dialog>
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
          Нет проезда на {value.unreachable} участках. Время и километраж
          неполные.
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
                  "Нет достоверного прогноза времени"
                ) : (
                  <>
                    {timeLabel(v.arrival)} → {timeLabel(v.departure)} · окно{" "}
                    {job?.data.windowFrom}–{job?.data.windowTo}
                    {v.wait > 0 ? ` · ожидание ${Math.ceil(v.wait)} мин` : ""}
                    {v.late > 0 ? ` · опоздание ${Math.ceil(v.late)} мин` : ""}
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
