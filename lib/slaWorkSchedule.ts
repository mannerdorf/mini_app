/**
 * Расчёт SLA с учётом рабочего графика заказчика.
 * Для статусов «Готов к выдаче» и «На доставке» часы SLA считаются только в рабочие дни и часы.
 */

export type WorkSchedule = {
  days_of_week: number[]; // 1=пн, 2=вт, ..., 7=вс (ISO)
  work_start: string;     // "09:00"
  work_end: string;       // "18:00"
};

function parseTime(s: string): { h: number; m: number } {
  const m = String(s || "09:00").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { h: 9, m: 0 };
  return { h: Math.min(23, Math.max(0, parseInt(m[1], 10))), m: Math.min(59, Math.max(0, parseInt(m[2], 10))) };
}

/** ISO day of week: 1=Mon, 7=Sun */
function getIsoDayOfWeek(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Подсчёт рабочих дней (дробных) между from и to.
 * Учитывает только рабочие часы в рабочие дни.
 */
export function workingDaysBetween(from: Date, to: Date, schedule: WorkSchedule): number {
  const { days_of_week, work_start, work_end } = schedule;
  const start = parseTime(work_start);
  const end = parseTime(work_end);
  const workStartMinutes = start.h * 60 + start.m;
  const workEndMinutes = end.h * 60 + end.m;
  if (workEndMinutes <= workStartMinutes) return 0;

  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs) return 0;

  const workDaySet = new Set(days_of_week.filter((d) => d >= 1 && d <= 7));

  let totalMinutes = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  while (cursor <= toDate) {
    const isoDay = getIsoDayOfWeek(cursor);
    if (!workDaySet.has(isoDay)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const dayStart = new Date(cursor);
    dayStart.setHours(Math.floor(workStartMinutes / 60), workStartMinutes % 60, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setHours(Math.floor(workEndMinutes / 60), workEndMinutes % 60, 0, 0);

    const segStart = Math.max(dayStart.getTime(), fromMs);
    const segEnd = Math.min(dayEnd.getTime(), toMs);

    if (segEnd > segStart) {
      totalMinutes += (segEnd - segStart) / (60 * 1000);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return totalMinutes / (24 * 60);
}

/**
 * Рабочих дней в planDays календарных днях начиная с from.
 */
export function workingDaysInPlan(from: Date, planCalendarDays: number, schedule: WorkSchedule): number {
  const to = new Date(from);
  to.setDate(to.getDate() + planCalendarDays);
  return workingDaysBetween(from, to, schedule);
}
