import {
  numberValue,
  plannedPlaces,
  requireValue,
  statusLabels,
  textValue,
  type Job,
  type JobStatus,
} from "./model.js";

/** Статусы, которые диспетчер может выставить вручную (если у водителя не работает приложение). */
export const PICKUP_DISPATCHER_MANUAL_JOB_STATUSES: JobStatus[] = [
  "pending",
  "arrived",
  "picked_up",
  "partial",
  "problem",
  "resolved",
  "deposited",
  "cancelled",
];

export function pickupDispatcherManualStatusOptions(): {
  value: JobStatus;
  label: string;
}[] {
  return PICKUP_DISPATCHER_MANUAL_JOB_STATUSES.map((value) => ({
    value,
    label: statusLabels[value],
  }));
}

export function parseDispatcherManualJobStatus(raw: unknown): JobStatus {
  requireValue(
    typeof raw === "string" &&
      PICKUP_DISPATCHER_MANUAL_JOB_STATUSES.includes(raw as JobStatus),
    "Выберите допустимый статус",
  );
  return raw as JobStatus;
}

export type DispatcherManualJobUpdate = {
  status: JobStatus;
  actual_places: number | null;
  note: string;
  resolution: string | null;
};

export function buildDispatcherManualJobUpdate(
  job: Job,
  target: JobStatus,
  body: { actual_places?: unknown; note?: unknown },
): DispatcherManualJobUpdate {
  const note = textValue(body.note, 3000);
  requireValue(note, "Укажите причину ручного изменения статуса");

  if (target === "picked_up" || target === "partial") {
    const count = numberValue(body.actual_places, "фактическое количество мест", 100000);
    requireValue(
      count !== null && count > 0 && Number.isInteger(count),
      "Укажите фактически забранное количество мест (целое число больше 0)",
    );
    if (count !== plannedPlaces(job.data)) {
      requireValue(note.length >= 3, "Объясните расхождение с плановым количеством мест");
    }
    const status: JobStatus =
      target === "partial" || count !== plannedPlaces(job.data) ? "partial" : "picked_up";
    return { status, actual_places: count, note, resolution: job.resolution };
  }

  if (target === "problem") {
    requireValue(note.length >= 3, "Опишите проблему на точке");
    return { status: "problem", actual_places: job.actual_places, note, resolution: null };
  }

  if (target === "resolved") {
    requireValue(
      ["problem", "partial"].includes(job.status),
      "Решение можно зафиксировать только для проблемы или частичного забора",
    );
    return {
      status: job.status === "problem" ? "resolved" : job.status,
      actual_places: job.actual_places,
      note,
      resolution: note,
    };
  }

  if (target === "cancelled") {
    return {
      status: "cancelled",
      actual_places: job.actual_places,
      note,
      resolution: note,
    };
  }

  if (target === "deposited") {
    return {
      status: "deposited",
      actual_places: job.actual_places,
      note,
      resolution: job.resolution,
    };
  }

  if (target === "arrived") {
    return { status: "arrived", actual_places: null, note, resolution: null };
  }

  return { status: "pending", actual_places: null, note, resolution: null };
}
