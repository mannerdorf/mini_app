import { requireValue, validDate } from "./model.js";

export type PickupScheduleMode = "once" | "periodic";
export type PickupSchedulePattern = "weekdays" | "dates";

export type PickupScheduleSpec = {
  mode: PickupScheduleMode;
  pattern?: PickupSchedulePattern;
  startDate: string;
  until?: string;
  weekdays?: number[];
  dates?: string[];
};

export const PICKUP_SCHEDULE_MAX_JOBS = 60;

export const PICKUP_WEEKDAY_LABELS: { iso: number; short: string }[] = [
  { iso: 1, short: "Пн" },
  { iso: 2, short: "Вт" },
  { iso: 3, short: "Ср" },
  { iso: 4, short: "Чт" },
  { iso: 5, short: "Пт" },
  { iso: 6, short: "Сб" },
  { iso: 7, short: "Вс" },
];

function parseDayUtc(iso: string): Date {
  validDate(iso);
  return new Date(`${iso}T12:00:00.000Z`);
}

function formatDayUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeekdayUtc(d: Date): number {
  const w = d.getUTCDay();
  return w === 0 ? 7 : w;
}

export function expandPickupScheduleDates(spec: PickupScheduleSpec): string[] {
  validDate(spec.startDate);
  if (spec.mode === "once") return [spec.startDate];

  if (spec.pattern === "dates") {
    const raw = spec.dates ?? [];
    const unique = [...new Set(raw.map((d) => d.trim()).filter(Boolean))];
    requireValue(unique.length > 0, "Добавьте хотя бы одну дату в график");
    for (const d of unique) validDate(d);
    unique.sort();
    requireValue(
      unique.length <= PICKUP_SCHEDULE_MAX_JOBS,
      `Не более ${PICKUP_SCHEDULE_MAX_JOBS} дат за один раз`,
    );
    return unique;
  }

  requireValue(spec.pattern === "weekdays", "Укажите тип периодического графика");
  const until = spec.until?.trim();
  requireValue(until, "Укажите дату окончания периода");
  validDate(until);
  const weekdays = (spec.weekdays ?? []).filter((n) => n >= 1 && n <= 7);
  requireValue(weekdays.length > 0, "Выберите дни недели");
  const set = new Set(weekdays);

  let cur = parseDayUtc(spec.startDate);
  const end = parseDayUtc(until);
  requireValue(cur.getTime() <= end.getTime(), "Дата начала позже даты окончания");

  const out: string[] = [];
  while (cur.getTime() <= end.getTime()) {
    if (set.has(isoWeekdayUtc(cur))) out.push(formatDayUtc(cur));
    cur = new Date(cur.getTime() + 86400000);
  }
  requireValue(out.length > 0, "В выбранном периоде нет дат по этим дням недели");
  requireValue(
    out.length <= PICKUP_SCHEDULE_MAX_JOBS,
    `Слишком много дат (${out.length}). Сократите период или выберите меньше дней (макс. ${PICKUP_SCHEDULE_MAX_JOBS}).`,
  );
  return out;
}

export function parsePickupScheduleBody(body: {
  date: string;
  schedule?: unknown;
}): PickupScheduleSpec {
  validDate(body.date);
  const s = body.schedule;
  if (!s || typeof s !== "object") {
    return { mode: "once", startDate: body.date };
  }
  const raw = s as Record<string, unknown>;
  const mode = raw.mode === "periodic" ? "periodic" : "once";
  if (mode === "once") {
    return { mode: "once", startDate: body.date };
  }
  const pattern =
    raw.pattern === "dates" ? "dates" : ("weekdays" as PickupSchedulePattern);
  if (pattern === "dates") {
    const dates = Array.isArray(raw.dates)
      ? raw.dates.map((d) => String(d).trim()).filter(Boolean)
      : [];
    return { mode: "periodic", pattern: "dates", startDate: body.date, dates };
  }
  const until = typeof raw.until === "string" ? raw.until.trim() : "";
  const weekdays = Array.isArray(raw.weekdays)
    ? raw.weekdays
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    : [];
  return {
    mode: "periodic",
    pattern: "weekdays",
    startDate: body.date,
    until,
    weekdays,
  };
}

export function scheduleMetaForJobData(
  spec: PickupScheduleSpec,
  groupId: string,
): Record<string, string> {
  if (spec.mode === "once") {
    return {
      scheduleMode: "once",
      schedulePattern: "",
      scheduleGroupId: "",
      scheduleWeekdays: "",
      scheduleUntil: "",
      scheduleDates: "",
    };
  }
  return {
    scheduleMode: "periodic",
    schedulePattern: spec.pattern ?? "weekdays",
    scheduleGroupId: groupId,
    scheduleWeekdays: (spec.weekdays ?? []).join(","),
    scheduleUntil: spec.until ?? "",
    scheduleDates: (spec.dates ?? []).join(","),
  };
}
