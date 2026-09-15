import React, { useRef, useState, useEffect } from "react";
import {
  plannedPlaces,
  routeWarnings,
  type Job,
  type Route,
  type Resource,
} from "../../../lib/pickup/model";
import { publicationIssues } from "./operations";
export function PickupPublishReview({
  route,
  jobs,
  resources,
  busy,
  error,
  onPublish,
}: {
  route: Route;
  jobs: Job[];
  resources: Resource[];
  busy: boolean;
  error: string;
  onPublish: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const issues = publicationIssues(route, jobs, resources);
  const vehicle = resources.find((r) => r.id === route.vehicle_id),
    driver = resources.find((r) => r.id === route.driver_id),
    depot = resources.find((r) => r.id === route.depot_id);
  return (
    <>
      <button
        className="pk-primary"
        disabled={busy || !jobs.length}
        onClick={() => setOpen(true)}
      >
        Проверить и опубликовать
      </button>
      {open && (
        <dialog
          className="pk-publish-dialog"
          ref={dialog}
          aria-label="Проверка маршрута перед публикацией"
          onCancel={(e) => {
            if (busy) e.preventDefault();
          }}
          onClose={() => setOpen(false)}
        >
          <h2>Проверьте маршрут</h2>
          <h3>
            {route.name} · {route.start_time}
          </h3>
          <p>
            {driver?.name} · {vehicle?.name} · {vehicle?.data.plate}
          </p>
          <p>
            {jobs.length} точек ·{" "}
            {jobs.reduce((n, j) => n + plannedPlaces(j.data), 0)} мест
          </p>
          <p>
            {jobs.reduce((n, j) => n + (j.data.weightKg ?? 0), 0)} /{" "}
            {vehicle?.data.capacityKg || "—"} кг ·{" "}
            {jobs.reduce((n, j) => n + (j.data.volumeM3 ?? 0), 0).toFixed(2)} /{" "}
            {vehicle?.data.capacityM3 || "—"} м³
          </p>
          <ol>
            {jobs.map((j) => (
              <li key={j.id}>
                {j.data.windowFrom}–{j.data.windowTo} · {j.data.senderName}
                <br />
                {j.data.address}
              </li>
            ))}
          </ol>
          <p>
            <strong>Сдать на склад:</strong> {depot?.name} ·{" "}
            {depot?.data.address}
          </p>
          {issues.map((x) => (
            <p key={x} className="pk-error">
              {x}
            </p>
          ))}
          {routeWarnings(jobs, vehicle)
            .filter((w) => !w.startsWith("Превышен"))
            .map((x) => (
              <p key={x} className="pk-warning">
                {x}
              </p>
            ))}
          <p className="pk-hint">
            Проверьте порядок, окна и проезд. После публикации водитель увидит
            маршрут.
          </p>
          {error && (
            <p className="pk-error" role="alert">
              {error}
            </p>
          )}
          <div className="pk-actions">
            <button
              className="pk-primary"
              disabled={busy || issues.length > 0}
              onClick={async () => {
                if (await onPublish()) dialog.current?.close();
              }}
            >
              {busy ? "Публикация…" : "Опубликовать водителю"}
            </button>
            <button disabled={busy} onClick={() => dialog.current?.close()}>
              Вернуться к плану
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
