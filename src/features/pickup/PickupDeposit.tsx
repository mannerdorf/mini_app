import React, { useEffect, useId, useState } from "react";
import { pickupJobNeedsZayavka, type Job } from "../../../lib/pickup/model";

export type DepositZayavka = { id: string; version: number; number: string };

export function PickupDeposit({
  jobs,
  busy,
  disabled,
  error,
  onConfirm,
  autoOpen = false,
  onDraftChange,
}: {
  onDraftChange?: (dirty: boolean) => void;
  jobs: Job[];
  busy: boolean;
  disabled: boolean;
  error: string;
  onConfirm: (numbers: DepositZayavka[]) => Promise<boolean>;
  /** Мобильный водитель: сразу форма сдачи, без лишнего клика. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => { onDraftChange?.(Object.values(values).some(Boolean)); }, [values, onDraftChange]);
  useEffect(() => () => onDraftChange?.(false), [onDraftChange]);
  const prefix = useId();
  const missing = jobs.filter(pickupJobNeedsZayavka);
  const ready = missing.every((job) => values[job.id]?.trim());
  if (!open)
    return (
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}>
        Сдал на склад
      </button>
    );
  return (
    <form
      className="pk-deposit-confirm"
      aria-label="Подтверждение сдачи на склад"
      onSubmit={async (e) => {
        e.preventDefault();
        if (disabled || !ready) return;
        if (
          await onConfirm(
            missing.map((job) => ({
              id: job.id,
              version: job.version,
              number: values[job.id].trim(),
            })),
          )
        ) {
          setOpen(false);
          setValues({});
        }
      }}
    >
      <h3>
        {missing.length
          ? "Укажите заявки перед сдачей"
          : "Подтвердите сдачу на склад"}
      </h3>
      {missing.length > 0 ? (
        <>
          <p className="pk-warning" role="status">
            Не заполнено поле «Заявка» у {missing.length} заборов. Введите номер
            для каждого — после этого можно подтвердить сдачу.
          </p>
          {missing.map((job) => (
            <div className="pk-deposit-request" key={job.id}>
              <strong>
                {job.job_number ? `${job.job_number} · ` : ""}
                {job.data.senderName}
              </strong>
              <p className="pk-hint">{job.data.address}</p>
              <label htmlFor={`${prefix}-${job.id}`}>Заявка · номер *</label>
              <input
                id={`${prefix}-${job.id}`}
                type="text"
                required
                maxLength={100}
                disabled={busy}
                autoComplete="off"
                placeholder="Введите номер заявки"
                value={values[job.id] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [job.id]: e.target.value }))
                }
              />
            </div>
          ))}
        </>
      ) : (
        <p className="pk-hint">
          Номера заявок заполнены у всех забранных грузов.
        </p>
      )}
      <p>Все забранные грузы переданы на склад Холз?</p>
      {error && (
        <p className="pk-error" role="alert">
          {error}
        </p>
      )}
      <div className="pk-actions">
        <button
          className="pk-primary"
          type="submit"
          disabled={disabled || !ready}
        >
          {busy
            ? "Сохраняем…"
            : missing.length
              ? "Сохранить заявки и подтвердить сдачу"
              : "Подтвердить сдачу"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}
