import { requireValue } from "./model.js";

export type DriverLocation = {
  route_id: string;
  driver_login: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  measured_at: string;
  received_at: string;
  last_observed_at?: string;
  warning?: string;
};

// Do not accept cached/offline positions as a current fix.
export function validateLocation(
  body: Record<string, unknown>,
  now = Date.now(),
) {
  const number = (key: string, min: number, max: number) => {
    const value = body[key];
    requireValue(
      typeof value === "number" &&
        Number.isFinite(value) &&
        value >= min &&
        value <= max,
      "Некорректные координаты или точность GPS",
    );
    return value;
  };
  const latitude = number("latitude", -90, 90);
  const longitude = number("longitude", -180, 180);
  const accuracy = number("accuracy", 0, 100000);
  const measuredAt =
    typeof body.measured_at === "string" ? Date.parse(body.measured_at) : NaN;
  requireValue(
    Number.isFinite(measuredAt) &&
      measuredAt >= now - 120000 &&
      measuredAt <= now + 30000,
    "Позиция GPS устарела или часы устройства неверны. Получите новые координаты.",
  );
  return {
    latitude,
    longitude,
    accuracy,
    measured_at: new Date(measuredAt).toISOString(),
  };
}

export const APPROXIMATE_ACCURACY_METRES = 200;
export function locationDistance(
  a: Pick<DriverLocation, "latitude" | "longitude">,
  b: Pick<DriverLocation, "latitude" | "longitude">,
) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function locationWarning(
  previous: DriverLocation | undefined,
  fix: ReturnType<typeof validateLocation>,
): string {
  if (previous) {
    // Once a jump is detected, repeated bad fixes cannot buy unlimited travel time.
    const seconds = Math.min(
      (Date.parse(fix.measured_at) - Date.parse(previous.measured_at)) / 1000,
      previous.warning ? 300 : Infinity,
    );
    const minimumDistance = Math.max(
      0,
      locationDistance(previous, fix) -
        Math.min(previous.accuracy, 200) -
        Math.min(fix.accuracy, 200),
    );
    if (minimumDistance > Math.max(0, seconds) * 50 + 500)
      return "Резкий скачок координат";
  }
  if (fix.accuracy > 1000) return "Слишком большая погрешность GPS";
  return "";
}
/** A suspect, approximate, or stale position must never be a routing origin. */
export function usableRoutingLocation(
  location: DriverLocation | undefined,
  now = Date.now(),
) {
  if (
    !location ||
    location.warning ||
    location.accuracy > APPROXIMATE_ACCURACY_METRES
  )
    return undefined;
  const age = now - Date.parse(location.measured_at);
  return Number.isFinite(age) && age >= -30000 && age <= 7 * 60000
    ? location
    : undefined;
}
