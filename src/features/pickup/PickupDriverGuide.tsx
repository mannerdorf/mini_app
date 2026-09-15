import React, { useEffect, useState } from "react";
import { plannedPlaces, type Job, type Route } from "../../../lib/pickup/model";
import { canDepositJobs, currentDriverJob } from "./operations";
import { PickupJobStatusBadge } from "./PickupJobStatusBadge";
export function PickupDriverGuide({
  route,
  jobs,
  queued,
  stale,
}: {
  route: Route;
  jobs: Job[];
  queued: boolean;
  stale: boolean;
}) {
  const current = currentDriverJob(jobs),
    done = jobs.filter((j) =>
      ["picked_up", "partial", "deposited"].includes(j.status),
    ).length;
  const closed = jobs.filter((j) => canDepositJobs([j])).length;
  const problems = jobs.filter(
    (j) => ["partial", "problem"].includes(j.status) && !j.resolution,
  ).length;
  const title =
    route.status === "completed"
      ? "Маршрут завершён"
      : queued
        ? "Отправьте сохранённую отметку"
        : route.status === "published"
          ? "Проверьте точки и начните маршрут"
          : canDepositJobs(jobs)
            ? "Следующий шаг — склад HAULZ"
            : current
              ? `Текущая точка · ${jobs.indexOf(current) + 1} из ${jobs.length}`
              : "Дождитесь решения диспетчера";
  return (
    <section
      className={`pk-driver-guide ${route.status === "completed" ? "pk-driver-guide--done" : ""}`}
    >
      <p className="pk-eyebrow">
        {stale ? "СОХРАНЁННЫЕ ДАННЫЕ" : "ВАШ МАРШРУТ"}
      </p>
      <h2>{title}</h2>
      {current && route.status === "started" && (
        <>
          <strong>{current.data.senderName}</strong>
          <p>{current.data.address}</p>
        </>
      )}
      <div className="pk-driver-progress">
        <progress
          value={closed}
          max={Math.max(1, jobs.length)}
          aria-label="Закрыто точек"
        />
        <span>
          Закрыто: {closed} / {jobs.length}
        </span>
      </div>
      <p className="pk-hint">
        Забрано с {done} точек. Без забора закрыто:{" "}
        {jobs.filter((j) => j.status === "resolved").length}.
      </p>
      {problems > 0 && (
        <p className="pk-warning">
          Требуют решения диспетчера: {problems}. Перед сдачей на склад
          дождитесь решения по этим точкам.
        </p>
      )}
      {route.status === "completed" && (
        <p>
          {done
            ? "Все результаты сохранены. Груз передан на склад."
            : "Все точки закрыты. Маршрут завершён."}
        </p>
      )}
      {queued && (
        <p>
          Результат находится на устройстве. Нажмите «Отправить отметки» выше;
          до синхронизации следующие действия заблокированы.
        </p>
      )}
    </section>
  );
}
export function PickupDriverStop({
  job,
  current,
  index,
  children,
}: {
  job: Job;
  current: boolean;
  index: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(current);
  useEffect(() => setOpen(current), [current]);
  return (
    <details
      className={`pk-driver-stop ${current ? "pk-driver-stop--current" : ""}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <span>
          <small>
            {current ? "Текущая точка" : `Точка ${index + 1}`} ·{" "}
            {job.data.windowFrom}–{job.data.windowTo}
          </small>
          <strong>{job.data.senderName}</strong>
          <span>{job.data.address}</span>
          <small>
            {plannedPlaces(job.data)} мест · {job.data.weightKg ?? "—"} кг
          </small>
        </span>
        <PickupJobStatusBadge status={job.status} />
      </summary>
      {children}
    </details>
  );
}
