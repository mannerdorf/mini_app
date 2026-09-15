import React, { useState } from "react";
import {
  plannedPlaces,
  routeWarnings,
  type Job,
  type Route,
  type Resource,
} from "../../../lib/pickup/model";
import { Select } from "./Forms";
import type { PickupCall } from "./client";
export function PickupBulkAssign({
  jobs,
  allJobs,
  routes,
  resources,
  call,
  clear,
  done,
}: {
  jobs: Job[];
  allJobs: Job[];
  routes: Route[];
  resources: Resource[];
  call: PickupCall;
  clear: () => void;
  done: (count: number) => void;
}) {
  const [routeId, setRouteId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const route = routes.find(
    (r) => r.id === routeId && ["draft", "published"].includes(r.status),
  );
  const combined = route
    ? [
        ...allJobs.filter(
          (j) => j.route_id === route.id && j.status !== "cancelled",
        ),
        ...jobs,
      ]
    : jobs;
  const vehicle =
    resources.find((r) => r.id === route?.vehicle_id) ??
    route?.snapshot.vehicle;
  const warnings = route ? routeWarnings(combined, vehicle) : [];
  const overloaded = warnings.some((w) => w.startsWith("Превышен"));
  return (
    <section className="pk-bulk" aria-label="Назначение выбранных заборов">
      <div className="pk-actions">
        <strong>Выбрано: {jobs.length}</strong>
        <span>{jobs.reduce((n, j) => n + plannedPlaces(j.data), 0)} мест</span>
        <button disabled={busy} onClick={clear}>
          Снять выделение
        </button>
      </div>
      <fieldset disabled={busy}>
        <Select
          label="Назначить в маршрут"
          value={routeId}
          onChange={(id) => {
            setRouteId(id);
            setError("");
          }}
          options={routes
            .filter((r) => ["draft", "published"].includes(r.status))
            .map((r) => ({
              id: r.id,
              name: `${r.name} · ${r.snapshot.driver?.name ?? "Водитель"} · ${allJobs.filter((j) => j.route_id === r.id && j.status !== "cancelled").length} точек`,
            }))}
        />
        {route && (
          <div className="pk-bulk-summary">
            <p>
              <strong>После назначения: {combined.length} точек</strong> ·{" "}
              {combined.reduce((n, j) => n + plannedPlaces(j.data), 0)} мест
            </p>
            <p>
              Вес: {combined.reduce((n, j) => n + (j.data.weightKg ?? 0), 0)} /{" "}
              {vehicle?.data.capacityKg || "—"} кг · Объём:{" "}
              {combined
                .reduce((n, j) => n + (j.data.volumeM3 ?? 0), 0)
                .toFixed(2)}{" "}
              / {vehicle?.data.capacityM3 || "—"} м³
            </p>
            {warnings.map((w) => (
              <p className="pk-warning" key={w}>
                {w}
              </p>
            ))}
            {route.status === "published" && (
              <p className="pk-hint">
                Состав опубликованного маршрута изменится. Водителю потребуется
                подтвердить изменения.
              </p>
            )}
          </div>
        )}
        <button
          className="pk-primary"
          disabled={!route || overloaded || busy}
          onClick={async () => {
            if (!route || busy) return;
            setBusy(true);
            setError("");
            try {
              await call({
                action: "assign_many",
                requestId: crypto.randomUUID(),
                route_id: route.id,
                route_version: route.version,
                jobs: jobs.map((j) => ({ id: j.id, version: j.version })),
              });
              done(jobs.length);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Назначение…" : `Назначить заборы (${jobs.length})`}
        </button>
      </fieldset>
      {error && (
        <p className="pk-error" role="alert">
          {error}
        </p>
      )}
      {!routes.some((r) => ["draft", "published"].includes(r.status)) && (
        <p className="pk-hint">Сначала создайте маршрут кнопкой «+ Маршрут».</p>
      )}
    </section>
  );
}
