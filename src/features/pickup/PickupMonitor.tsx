import React, { useState } from "react";
import { LocateFixed, Phone, Truck } from "lucide-react";
import type { Snapshot, Route } from "../../../lib/pickup/model";
import { PickupAccuracyMap } from "./PickupAccuracyMap";
import { PickupRouteStatusBadge } from "./PickupRouteStatusBadge";
import { currentDriverJob } from "./operations";
import {
  locationAge,
  pickupProgress,
  routingOrigin,
  approximateMapUrl,
} from "./monitor";

export function PickupMonitor({
  snapshot,
  now,
  stale,
  onRoute,
}: {
  snapshot: Snapshot;
  now: Date;
  stale: boolean;
  onRoute: (route: Route) => void;
}) {
  const [selected, setSelected] = useState("");
  const routes = [...snapshot.routes].sort(
    (a, b) => Number(b.status === "started") - Number(a.status === "started"),
  );
  const route = routes.find((r) => r.id === selected) ?? routes[0];
  const location = snapshot.locations?.find((l) => l.route_id === route?.id);
  const age = locationAge(location, now);
  const origin = route && routingOrigin(snapshot, route.id, now);
  const areaUrl = location && approximateMapUrl(location);
  const mapParams = location
    ? new URLSearchParams({
        ll: `${location.longitude},${location.latitude}`,
        z: "14",
        pt: `${location.longitude},${location.latitude},pm2${!location.warning && location.accuracy <= 200 && age.fresh && !stale && route?.status === "started" ? "bl" : "gr"}m`,
      })
    : null;
  return (
    <section className="pk-monitor" aria-label="Монитор рейсов">
      <div className="pk-section-heading">
        <div>
          <h2>
            <Truck size={22} /> Монитор рейсов
          </h2>
          <p className="pk-hint">
            Город и дата выбраны выше · обновление каждые 15 секунд
          </p>
          <p className="pk-hint">Позиция передаётся только при открытом экране маршрута у водителя. При переходе в навигатор или блокировке телефона показана последняя принятая позиция с её возрастом.</p>
        </div>
        <span className="pk-hint">
          В пути: {routes.filter((r) => r.status === "started").length} ·
          Завершено: {routes.filter((r) => r.status === "completed").length}
        </span>
      </div>
      {stale && (
        <p className="pk-warning" role="status">
          Нет свежего обновления. Показаны последние полученные статусы и
          координаты.
        </p>
      )}
      {snapshot.locationAvailable === false && (
        <p className="pk-warning">
          GPS ещё не подключён администратором. Статусы заборов доступны.
        </p>
      )}
      {!routes.length ? (
        <p className="pk-empty">На выбранную дату маршрутов нет.</p>
      ) : (
        <div className="pk-monitor-grid">
          <div className="pk-monitor-list">
            {routes.map((r) => {
              const jobs = snapshot.jobs
                .filter((j) => j.route_id === r.id && j.status !== "cancelled")
                .sort((a, b) => a.position - b.position);
              const progress = pickupProgress(jobs),
                current = currentDriverJob(jobs);
              const fix = snapshot.locations?.find((l) => l.route_id === r.id),
                freshness = locationAge(fix, now);
              const phone = r.snapshot.driver?.data.phone;
              return (
                <article
                  key={r.id}
                  className={`pk-monitor-card ${route?.id === r.id ? "pk-monitor-card--selected" : ""}`}
                >
                  <button
                    className="pk-monitor-select"
                    onClick={() => setSelected(r.id)}
                    aria-pressed={route?.id === r.id}
                  >
                    <span className="pk-section-heading">
                      <strong>
                        {r.snapshot.driver?.name || "Водитель не назначен"}
                      </strong>
                      <PickupRouteStatusBadge status={r.status} />
                    </span>
                    <span className="pk-hint">
                      {r.name} ·{" "}
                      {r.snapshot.vehicle?.data.plate || "Без номера ТС"}
                    </span>
                    <strong className="pk-monitor-count">
                      Груз забран: {progress.collected} из {progress.total}
                    </strong>
                    <progress
                      value={progress.collected}
                      max={Math.max(1, progress.total)}
                      aria-label={`Заборы: ${r.name}`}
                    />
                    {!!progress.partial && (
                      <span className="pk-hint">
                        Из них частично: {progress.partial}
                      </span>
                    )}
                    {!!progress.resolved && (
                      <span className="pk-hint">
                        Закрыто без забора: {progress.resolved}
                      </span>
                    )}
                    {!!progress.problems && (
                      <span className="pk-monitor-problem">
                        Требуют решения: {progress.problems}
                      </span>
                    )}
                    <span>
                      {r.status === "completed"
                        ? "Маршрут завершён · склад HAULZ"
                        : current
                          ? `${current.status === "arrived" ? "На точке (отметка водителя)" : "Следующий забор"}: ${current.data.senderName}`
                          : r.status === "started" && progress.problems
                            ? "Ожидается решение диспетчера"
                            : r.status === "started"
                              ? "Следующий этап: склад HAULZ"
                              : "Ожидает старта"}
                    </span>
                    {current && (
                      <span className="pk-hint">{current.data.address}</span>
                    )}
                    <span
                      className={`pk-gps-badge ${fix?.warning || (fix && fix.accuracy > 200) ? "pk-gps-badge--warning" : ""} ${fix && !fix.warning && fix.accuracy <= 200 && freshness.fresh && !stale && r.status === "started" ? "pk-gps-badge--fresh" : ""}`}
                    >
                      <LocateFixed size={15} />
                      {fix?.warning
                        ? `GPS ненадёжен · ${freshness.text}`
                        : fix
                          ? `${fix.accuracy > 200 ? "Приблизительно" : "GPS"}: ${freshness.text}`
                          : "GPS ещё не получен"}
                    </span>
                  </button>
                  <div className="pk-actions">
                    <button onClick={() => onRoute(r)}>Открыть маршрут</button>
                    {phone && (
                      <a
                        className="pk-action-link"
                        href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                      >
                        <Phone size={16} /> Водителю
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <section
            className="pk-panel pk-monitor-map"
            aria-label="Позиция выбранного водителя"
          >
            <h3>{route.snapshot.driver?.name}</h3>
            <p>Последняя принятая GPS-позиция</p>
            {location?.warning && (
              <p className="pk-warning" role="status">
                GPS ненадёжен — {location.warning.toLowerCase()}. Новые
                подозрительные координаты не используются. Последняя принятая
                позиция могла устареть.
              </p>
            )}
            {origin?.kind === "stop" && (
              <p className="pk-warning">
                Ориентир для расчёта: {origin.address} · отметка водителя{" "}
                {new Date(origin.at).toLocaleString("ru-RU")}. Это адрес
                последней отмеченной остановки, а не текущее положение.
              </p>
            )}
            {!origin && (
              <p className="pk-hint">
                Нет надёжной позиции или отмеченной остановки для расчёта.
                Начальную точку нужно выбрать вручную.
              </p>
            )}
            {location && mapParams ? (
              <>
                <p
                  className={
                    !location.warning &&
                    location.accuracy <= 200 &&
                    age.fresh &&
                    !stale &&
                    route.status === "started"
                      ? "pk-hint"
                      : "pk-warning"
                  }
                >
                  {route.status === "completed"
                    ? "Последняя позиция завершённого рейса"
                    : !age.fresh || stale
                      ? "Позиция устарела — водитель мог переместиться"
                      : location.warning
                        ? "Показана прежняя позиция"
                        : location.accuracy > 200
                          ? "Приблизительное положение"
                          : "Недавно получена"}{" "}
                  · {age.text}
                </p>
                {areaUrl && (
                  <p className="pk-warning">
                    Приблизительная область: радиус погрешности{" "}
                    {Math.round(location.accuracy)} м. Круг на карте обозначает
                    область погрешности без точного маркера. Оценка устройства
                    не гарантирует достоверность GPS.
                  </p>
                )}
                {areaUrl ? (
                  <PickupAccuracyMap location={location} />
                ) : (
                  <iframe
                    className="pk-map"
                    title={`Последняя позиция: ${route.snapshot.driver?.name}`}
                    src={
                      areaUrl || `https://yandex.ru/map-widget/v1/?${mapParams}`
                    }
                    referrerPolicy="no-referrer"
                  />
                )}
                <p className="pk-hint">
                  Снята{" "}
                  {new Date(location.measured_at).toLocaleString("ru-RU", {
                    timeZone:
                      route.city === "moscow"
                        ? "Europe/Moscow"
                        : "Europe/Kaliningrad",
                  })}{" "}
                  · точность ±{Math.round(location.accuracy)} м
                </p>
                <a
                  className="pk-action-link"
                  href={areaUrl || `https://yandex.ru/maps/?${mapParams}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {areaUrl
                    ? "Открыть приблизительную область"
                    : "Открыть позицию в Яндекс Картах"}
                </a>
              </>
            ) : (
              <div className="pk-empty">
                <LocateFixed size={32} />
                <p>Координаты ещё не получены</p>
                <p className="pk-hint">
                  Водителю нужно начать маршрут и включить «Передавать моё
                  местоположение» на своём устройстве.
                </p>
              </div>
            )}
            <p className="pk-hint">
              Адрес следующего забора — план. Положение на карте определяется
              GPS устройства водителя.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
