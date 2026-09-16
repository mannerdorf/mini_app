import type { Job, Route } from "../../../lib/pickup/model";
export type DayFilter =
  "all" | "unassigned" | "collected" | "attention" | "cancelled";
export function matchesDayFilter(job: Job, filter: DayFilter): boolean {
  if (filter === "cancelled") return job.status === "cancelled";
  if (job.status === "cancelled") return false;
  if (filter === "unassigned") return !job.route_id;
  if (filter === "collected")
    return ["picked_up", "partial", "deposited"].includes(job.status);
  if (filter === "attention")
    return ["partial", "problem"].includes(job.status) && !job.resolution;
  return true;
}
export function matchesDaySearch(
  job: Job,
  query: string,
  routes: Route[],
): boolean {
  const route = routes.find((r) => r.id === job.route_id);
  const haystack = [
    job.job_number ?? "",
    job.data.senderName,
    job.data.customerName,
    job.data.address,
    job.data.zayavkaNumber,
    job.data.cargoNumber,
    route?.name,
    route?.snapshot.driver?.name,
  ]
    .join(" ")
    .toLocaleLowerCase("ru");
  return query
    .trim()
    .toLocaleLowerCase("ru")
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
