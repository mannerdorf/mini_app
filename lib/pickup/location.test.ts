import { it, expect } from "vitest";
import {
  locationWarning,
  usableRoutingLocation,
  type DriverLocation,
} from "./location";
const previous: DriverLocation = {
  route_id: "r",
  driver_login: "d",
  latitude: 55.75,
  longitude: 37.61,
  accuracy: 20,
  measured_at: "2026-09-16T10:00:00Z",
  received_at: "2026-09-16T10:00:00Z",
};
it("rejects 100km in five minutes and cannot hide a jump behind accuracy", () => {
  const fix = {
    ...previous,
    latitude: 56.65,
    measured_at: "2026-09-16T10:05:00Z",
  };
  expect(locationWarning(previous, fix)).toBe("Резкий скачок координат");
  expect(locationWarning(previous, { ...fix, accuracy: 100000 })).toBeTruthy();
  expect(
    locationWarning(
      { ...previous, warning: "Резкий скачок координат" },
      { ...fix, measured_at: "2026-09-16T14:00:00Z" },
    ),
  ).toBeTruthy();
});
it("allows ordinary movement, stationary noise and recovery near accepted fix", () => {
  expect(
    locationWarning(previous, {
      ...previous,
      latitude: 55.8,
      measured_at: "2026-09-16T10:05:00Z",
    }),
  ).toBe("");
  expect(
    locationWarning(
      { ...previous, warning: "Резкий скачок координат" },
      { ...previous, latitude: 55.7501, measured_at: "2026-09-16T10:06:00Z" },
    ),
  ).toBe("");
  expect(
    locationWarning(previous, {
      ...previous,
      accuracy: 2000,
      measured_at: "2026-09-16T10:05:00Z",
    }),
  ).toBe("Слишком большая погрешность GPS");
});
it("never routes from suspect, coarse, stale or future fixes", () => {
  const now = Date.parse("2026-09-16T10:05:00Z");
  expect(usableRoutingLocation(previous, now)).toBe(previous);
  for (const patch of [
    { warning: "jump" },
    { accuracy: 201 },
    { measured_at: "2026-09-16T09:50:00Z" },
    { measured_at: "2026-09-16T10:10:00Z" },
  ])
    expect(
      usableRoutingLocation({ ...previous, ...patch }, now),
    ).toBeUndefined();
});
