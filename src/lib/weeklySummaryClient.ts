/** Прошлая календарная неделя (пн–вс) — зеркало серверной логики для UI по умолчанию. */
export function getPreviousCalendarWeekRangeClient(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const daysToMonday = (now.getDay() + 6) % 7;
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(now.getDate() - daysToMonday);
  const prevMonday = new Date(thisMonday);
  prevMonday.setDate(thisMonday.getDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevMonday.getDate() + 6);
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  return { dateFrom: fmt(prevMonday), dateTo: fmt(prevSunday) };
}
