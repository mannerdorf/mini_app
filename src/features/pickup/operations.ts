import {
  routeWarnings,
  type City,
  type Job,
  type Route,
  type Resource,
} from "../../../lib/pickup/model";
import { driverHasInvalidWorkShift, driverHasWorkShift } from "../../../lib/pickup/driverShift";
export function cityClock(city: City, now: Date) {
  const timeZone = city === "moscow" ? "Europe/Moscow" : "Europe/Kaliningrad";
  return {
    day: new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now),
  };
}
export type Attention = {
  id: string;
  kind: "problem" | "window" | "ack";
  tone: "red" | "amber";
  title: string;
  detail: string;
  job?: Job;
  route?: Route;
};
export function attentionItems(
  jobs: Job[],
  routes: Route[],
  city: City,
  now: Date,
): Attention[] {
  const clock = cityClock(city, now),
    minutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  const items: Attention[] = [];
  for (const job of jobs) {
    if (["problem", "partial"].includes(job.status) && !job.resolution)
      items.push({
        id: `problem:${job.id}`,
        kind: "problem",
        tone: "red",
        title:
          job.status === "partial"
            ? "Расхождение количества мест"
            : "Проблема на точке",
        detail: job.note || "Нужно решение диспетчера",
        job,
      });
    if (!["pending", "arrived"].includes(job.status)) continue;
    const delta = minutes(job.data.windowTo) - minutes(clock.time);
    if (job.date > clock.day || (job.date === clock.day && delta > 30))
      continue;
    items.push({
      id: `window:${job.id}`,
      kind: "window",
      tone: job.date < clock.day || delta < 0 ? "red" : "amber",
      title:
        job.date < clock.day || delta < 0
          ? "Окно забора закончилось"
          : `До конца окна: ${delta} мин.`,
      detail: `Забрать до ${job.data.windowTo}. Уточните возможность погрузки.`,
      job,
    });
  }
  for (const route of routes)
    if (
      ["published", "started"].includes(route.status) &&
      route.acknowledged_version !== route.version
    )
      items.push({
        id: `ack:${route.id}`,
        kind: "ack",
        tone: "amber",
        title: "Ожидает подтверждения водителя",
        detail: `${route.name} · ${route.snapshot.driver?.name ?? ""}`,
        route,
      });
  return items.sort(
    (a, b) => (a.tone === "red" ? 0 : 1) - (b.tone === "red" ? 0 : 1),
  );
}
export function movePendingStop(
  jobs: Job[],
  from: string,
  to: string,
): string[] | null {
  const a = jobs.findIndex((j) => j.id === from),
    b = jobs.findIndex((j) => j.id === to);
  if (
    a < 0 ||
    b < 0 ||
    a === b ||
    jobs[a].status !== "pending" ||
    jobs[b].status !== "pending"
  )
    return null;
  const ids = jobs.map((j) => j.id);
  ids.splice(b, 0, ids.splice(a, 1)[0]);
  return jobs.some((j, i) => j.status !== "pending" && ids[i] !== j.id)
    ? null
    : ids;
}
export function publicationIssues(
  route: Route,
  jobs: Job[],
  resources: Resource[],
): string[] {
  const driver = resources.find((r) => r.id === route.driver_id),
    vehicle = resources.find((r) => r.id === route.vehicle_id),
    depot = resources.find((r) => r.id === route.depot_id);
  const issues: string[] = [];
  if (!jobs.length) issues.push("Добавьте хотя бы один забор.");
  if (!driver?.active) issues.push("Водитель недоступен для назначения.");
  if (!vehicle?.active) issues.push("Автомобиль недоступен для назначения.");
  if (!depot?.active) issues.push("Склад недоступен.");
  if (driver && driverHasInvalidWorkShift(driver.data))
    issues.push("Некорректная смена водителя: начало должно быть раньше окончания.");
  if (
    driver &&
    driverHasWorkShift(driver.data) &&
    (route.start_time < driver.data.from ||
      route.start_time >= driver.data.to)
  )
    issues.push("Старт вне смены водителя.");
  if (
    jobs.some(
      (j) =>
        j.data.windowTo <= route.start_time ||
        (driver &&
          driverHasWorkShift(driver.data) &&
          j.data.windowFrom >= driver.data.to) ||
        (depot && j.data.windowFrom >= depot.data.to),
    )
  )
    issues.push("Есть точки вне времени маршрута или работы склада.");
  return issues;
}
export function publicationCapacityWarnings(
  jobs: Job[],
  resources: Resource[],
  route: Route,
): string[] {
  const vehicle = resources.find((r) => r.id === route.vehicle_id);
  return routeWarnings(jobs, vehicle).filter((w) => w.startsWith("Превышен"));
}
export function currentDriverJob(jobs: Job[]) {
  return (
    jobs.find((j) => j.status === "arrived") ??
    jobs.find((j) => j.status === "pending")
  );
}
/** Все точки закрыты водителем — можно ехать на склад (без ожидания диспетчера). */
export function canDepositJobs(jobs: Job[]): boolean {
  return (
    jobs.length > 0 &&
    jobs.every((j) => !["pending", "arrived"].includes(j.status))
  );
}
