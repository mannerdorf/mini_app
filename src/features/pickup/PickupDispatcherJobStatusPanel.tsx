import React, { useState } from "react";
import type { Job } from "../../../lib/pickup/model";
import { pickupDispatcherManualStatusOptions } from "../../../lib/pickup/dispatcherJobStatus";
import { Textarea } from "./Forms";

type Action = (
  body: Record<string, unknown>,
  title: string,
) => Promise<boolean>;

export function PickupDispatcherJobStatusPanel({
  job,
  busy,
  act,
}: {
  job: Job;
  busy: boolean;
  act: Action;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(job.status);
  const [actualPlaces, setActualPlaces] = useState(
    job.actual_places != null ? String(job.actual_places) : "",
  );
  const [zayavkaNumber, setZayavkaNumber] = useState(job.data.zayavkaNumber || "");
  const [note, setNote] = useState("");

  const needsPlaces = status === "picked_up" || status === "partial";

  return (
    <details
      className="pk-dispatcher-status"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>Статус вручную (если у водителя не работает приложение)</summary>
      <div className="pk-grid">
        <label className="pk-field">
          <span>Новый статус</span>
          <select
            className="admin-form-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as Job["status"])}
          >
            {pickupDispatcherManualStatusOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {status === "deposited" && (
          <label className="pk-field">
            <span>Номер заявки *</span>
            <input
              type="text"
              maxLength={100}
              value={zayavkaNumber}
              placeholder="Как в 1С, включая начальные нули"
              onChange={(e) => setZayavkaNumber(e.target.value)}
              disabled={busy}
              required
            />
            <small>Номер сохранится вместе со статусом «Сдан на склад».</small>
          </label>
        )}
        {needsPlaces && (
          <label className="pk-field">
            <span>Фактически мест</span>
            <input
              type="number"
              min={1}
              step={1}
              value={actualPlaces}
              onChange={(e) => setActualPlaces(e.target.value)}
            />
          </label>
        )}
      </div>
      <Textarea
        label="Причина / комментарий"
        value={note}
        onChange={setNote}
      />
      <button
        type="button"
        className="pk-primary"
        disabled={busy || !note.trim() || (needsPlaces && !actualPlaces.trim()) || (status === "deposited" && !zayavkaNumber.trim())}
        onClick={() =>
          void act(
            {
              action: "set_job_status",
              id: job.id,
              version: job.version,
              status,
              note,
              ...(status === "deposited" ? { zayavkaNumber: zayavkaNumber.trim() } : {}),
              ...(needsPlaces ? { actual_places: Number(actualPlaces) } : {}),
            },
            "Статус забора обновлён",
          ).then((ok) => {
            if (ok) {
              setNote("");
              setOpen(false);
            }
          })
        }
      >
        Применить статус
      </button>
    </details>
  );
}
