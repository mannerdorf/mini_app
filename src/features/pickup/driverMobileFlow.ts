import type { Job, Route } from "../../../lib/pickup/model";
import { canDepositJobs, currentDriverJob } from "./operations";

export type DriverMobilePhase =
  | "sync"
  | "published"
  | "ack"
  | "on_stop"
  | "deposit"
  | "completed";

/** Для мониторинга диспетчера (не блокирует водителя). */
export function jobsAwaitingDispatcher(jobs: Job[]): Job[] {
  return jobs.filter(
    (j) => (j.status === "problem" || j.status === "partial") && !j.resolution,
  );
}

/** Один активный шаг мобильного UX водителя (без выбора точек и вложенных списков). */
export function driverMobilePhase(
  route: Route,
  jobs: Job[],
  opts: { outboxCount: number },
): DriverMobilePhase {
  if (opts.outboxCount > 0) return "sync";
  if (route.status === "completed") return "completed";
  if (route.status === "published") return "published";
  if (route.status !== "started") return "completed";

  if (route.acknowledged_version !== route.version) return "ack";

  const current = currentDriverJob(jobs);

  if (current) return "on_stop";
  if (canDepositJobs(jobs)) return "deposit";

  return "deposit";
}

export function driverStopProgress(jobs: Job[]) {
  const closed = jobs.filter((j) =>
    ["picked_up", "partial", "deposited", "resolved"].includes(j.status),
  ).length;
  return { closed, total: jobs.length };
}
