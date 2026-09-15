import { plannedPlaces, type Job } from "../../../lib/pickup/model";
import {
  usableRoutingLocation,
  APPROXIMATE_ACCURACY_METRES,
  type DriverLocation,
} from "../../../lib/pickup/location";
export function pickupProgress(jobs: Job[]) {
  const active = jobs.filter((j) => j.status !== "cancelled");
  const collected = active.filter((j) =>
    ["picked_up", "partial", "deposited"].includes(j.status),
  );
  return {
    total: active.length,
    collected: collected.length,
    partial: collected.filter(
      (j) =>
        j.status === "partial" ||
        (j.actual_places != null && j.actual_places !== plannedPlaces(j.data)),
    ).length,
    resolved: active.filter((j) => j.status === "resolved").length,
    problems: active.filter(
      (j) => ["partial", "problem"].includes(j.status) && !j.resolution,
    ).length,
  };
}
export function locationAge(location: DriverLocation | undefined, now: Date) {
  if (!location) return { fresh: false, text: "Нет GPS-позиции" };
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(location.measured_at)) / 1000),
  );
  const text =
    seconds < 60
      ? `${seconds} с назад`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)} мин назад`
        : `${Math.floor(seconds / 3600)} ч назад`;
  return {
    fresh: Number.isFinite(seconds) && seconds <= 7 * 60,
    text: Number.isFinite(seconds) ? text : "Время неизвестно",
  };
}

/** Explicit fallback: a driver's latest arrival/collection event, never stop order. */
export function routingOrigin(
  snapshot: import("../../../lib/pickup/model").Snapshot,
  routeId: string,
  now: Date,
) {
  const gps = usableRoutingLocation(
    snapshot.locations?.find((l) => l.route_id === routeId),
    now.getTime(),
  );
  if (gps)
    return {
      kind: "gps" as const,
      latitude: gps.latitude,
      longitude: gps.longitude,
    };
  const events = snapshot.events
    .filter(
      (e) =>
        e.route_id === routeId &&
        ["Прибыл на точку", "Груз забран", "Проблема на точке"].includes(
          e.action,
        ),
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const job = snapshot.jobs.find(
    (j) => j.id === events[0]?.job_id && j.route_id === routeId,
  );
  return job?.data.address
    ? {
        kind: "stop" as const,
        address: job.data.address,
        at: events[0].created_at,
      }
    : undefined;
}
export function approximateMapUrl(location: DriverLocation) {
  if (location.accuracy <= APPROXIMATE_ACCURACY_METRES) return undefined;
  // Show the bounding area of the accuracy circle, without a misleading pin.
  const dy = location.accuracy / 111000;
  const dx = dy / Math.max(0.01, Math.cos((location.latitude * Math.PI) / 180));
  const bbox = [
    Math.max(-180, location.longitude - dx),
    Math.max(-85, location.latitude - dy),
    Math.min(180, location.longitude + dx),
    Math.min(85, location.latitude + dy),
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik`;
}
