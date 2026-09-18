import React, { useEffect, useRef, useState } from "react";
import { plannedPlaces, type Job, type Route } from "../../../lib/pickup/model";
import { PickupJobStatusBadge } from "./PickupJobStatusBadge";
import { PickupEditGuardProvider, usePickupEditGuard } from "./PickupEditGuard";
import { PickupJobNumber } from "./PickupJobNumber";
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
  const { states, canClose, notice, confirmClose, cancelClose } = usePickupEditGuard();
  const close = () => { if (canClose()) dialog.current?.close(); };
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  useEffect(() => {
    if (confirmClose) dialog.current?.querySelector<HTMLButtonElement>("[data-continue-edit]")?.focus();
  }, [confirmClose]);
  useEffect(() => {
    if (closeWhen) close();
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
          <span className="pk-day-number" aria-label={`Номер забора: ${job.job_number || "не присвоен"}`}>{job.job_number || "—"}</span>
          <span className="pk-day-time">
            {job.data.windowFrom}–{job.data.windowTo}
          </span>
          <span className="pk-day-address">
            <strong>{job.data.senderName}</strong>
            <span>{job.data.address}</span>
            {job.data.zayavkaNumber && <small>Заявка {job.data.zayavkaNumber}</small>}
          </span>
          <span className="pk-day-customer">
            <small className="pk-day-customer-label">Заказчик</small>
            {job.data.customerName || "—"}
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
          onCancel={event => { event.preventDefault(); close(); }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="pk-day-drawer-body">
            <header className="pk-day-drawer-header">
              <div>
                <h2>Карточка забора</h2>
                <PickupJobNumber job={job} prominent />
              </div>
              <button
                type="button"
                autoFocus
                onClick={close}
              >
                Закрыть
              </button>
            </header>
            {confirmClose && <div className="pk-panel" role="alert">
              <p>Номер заявки или расчёты изменены, но ещё не сохранены.</p>
              <div className="pk-actions">
                <button type="button" data-continue-edit onClick={cancelClose}>Продолжить редактирование</button>
                <button type="button" onClick={() => { if (canClose(true)) dialog.current?.close(); }}>Закрыть без сохранения</button>
              </div>
            </div>}
            {notice && <p role="status">{notice}</p>}
            <PickupEditGuardProvider value={states}>{children}</PickupEditGuardProvider>
          </div>
        </dialog>
      )}
    </>
  );
}
