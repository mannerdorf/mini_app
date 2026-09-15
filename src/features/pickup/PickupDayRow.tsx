import React, { useEffect, useRef, useState } from "react";
import { plannedPlaces, type Job, type Route } from "../../../lib/pickup/model";
import { PickupJobStatusBadge } from "./PickupJobStatusBadge";
export function PickupDayRow({
  job,
  route,
  children,
  closeWhen,
  checked,
  onCheck,
}: {
  job: Job;
  route?: Route;
  closeWhen: boolean;
  checked: boolean;
  onCheck: (value: boolean) => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  useEffect(() => {
    if (closeWhen) dialog.current?.close();
  }, [closeWhen]);
  return (
    <>
      <div
        className={`pk-day-selectable ${checked ? "pk-day-selectable--checked" : ""}`}
      >
        <input
          type="checkbox"
          className="pk-job-check"
          checked={checked && !job.route_id && job.status === "pending"}
          disabled={Boolean(job.route_id) || job.status !== "pending"}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label={`Выбрать забор: ${job.data.address}`}
          title={job.route_id ? "Уже назначен" : "Выбрать для назначения"}
        />
        <button
          type="button"
          className="pk-day-row"
          onClick={() => setOpen(true)}
          aria-label={`Открыть забор: ${job.data.senderName}, ${job.data.address}`}
        >
          <span className="pk-day-time">
            {job.data.windowFrom}–{job.data.windowTo}
          </span>
          <span className="pk-day-address">
            <strong>{job.data.senderName}</strong>
            <span>{job.data.address}</span>
            <small>
              {job.data.customerName}
              {job.data.zayavkaNumber ? ` · № ${job.data.zayavkaNumber}` : ""}
            </small>
          </span>
          <span className="pk-day-cargo">
            {plannedPlaces(job.data)} мест
            <small>
              {job.data.weightKg ?? "—"} кг · {job.data.volumeM3 ?? "—"} м³
            </small>
          </span>
          <span className="pk-day-driver">
            {route?.snapshot.driver?.name || "Не назначен"}
            <small>{route?.name || "Без маршрута"}</small>
          </span>
          <PickupJobStatusBadge status={job.status} />
          <span aria-hidden="true">→</span>
        </button>
      </div>
      {open && (
        <dialog
          ref={dialog}
          className="pk-day-drawer"
          aria-label={`Забор: ${job.data.senderName}`}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) dialog.current?.close();
          }}
        >
          <div className="pk-day-drawer-body">
            <header className="pk-day-drawer-header">
              <h2>Карточка забора</h2>
              <button
                type="button"
                autoFocus
                onClick={() => dialog.current?.close()}
              >
                Закрыть
              </button>
            </header>
            {children}
          </div>
        </dialog>
      )}
    </>
  );
}
