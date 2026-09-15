import { it, expect } from "vitest";
import type { Job } from "../../../lib/pickup/model";
import type { DriverLocation } from "../../../lib/pickup/location";
import {
  pickupProgress,
  locationAge,
  routingOrigin,
  approximateMapUrl,
} from "./monitor";
it("counts collected pickups separately from cancellations and resolutions, including deposited discrepancies", () => {
  const jobs = [
    "picked_up",
    "partial",
    "deposited",
    "resolved",
    "cancelled",
    "problem",
    "pending",
  ].map((status, i) => ({
    status,
    actual_places: i === 2 ? 1 : 2,
    data: { places: [{ count: 2 }] },
    resolution: "",
  })) as Job[];
  expect(pickupProgress(jobs)).toEqual({
    total: 6,
    collected: 3,
    partial: 2,
    resolved: 1,
    problems: 2,
  });
});
it("ages GPS from measurement time rather than a recent network receipt", () => {
  const now = new Date("2026-09-15T10:08:00Z");
  const fix = {
    measured_at: "2026-09-15T10:00:00Z",
    received_at: now.toISOString(),
  } as DriverLocation;
  expect(locationAge(fix, now)).toEqual({ fresh: false, text: "8 мин назад" });
  expect(
    locationAge({ ...fix, measured_at: "2026-09-15T10:07:30Z" }, now),
  ).toEqual({ fresh: true, text: "30 с назад" });
  expect(
    locationAge({ ...fix, measured_at: "2026-09-15T10:03:00Z" }, now),
  ).toEqual({ fresh: true, text: "5 мин назад" });
  expect(locationAge(undefined, now).fresh).toBe(false);
});

it("uses latest driver's stop event as a labelled routing fallback, never route order", () => {
  const now = new Date("2026-09-16T10:00:00Z");
  const snapshot = {
    locations: [
      {
        route_id: "r",
        warning: "jump",
        latitude: 55,
        longitude: 37,
        accuracy: 10,
        measured_at: now.toISOString(),
      },
    ],
    jobs: [
      {
        id: "a",
        route_id: "r",
        position: 9,
        data: { address: "Последняя отметка" },
      },
      {
        id: "b",
        route_id: "r",
        position: 1,
        data: { address: "Другой адрес" },
      },
    ],
    events: [
      {
        route_id: "r",
        job_id: "a",
        action: "Груз забран",
        created_at: now.toISOString(),
      },
      {
        route_id: "r",
        job_id: "b",
        action: "Прибыл на точку",
        created_at: "2026-09-16T09:00:00Z",
      },
    ],
  } as any;
  expect(routingOrigin(snapshot, "r", now)).toMatchObject({
    kind: "stop",
    address: "Последняя отметка",
  });
  expect(routingOrigin({ ...snapshot, events: [] }, "r", now)).toBeUndefined();
});
it("shows an area without a precise pin for approximate GPS", () => {
  const fix = {
    latitude: 55.75,
    longitude: 37.61,
    accuracy: 500,
  } as DriverLocation;
  const url = approximateMapUrl(fix)!;
  expect(url).toContain("bbox=");
  expect(url).not.toContain("marker");
  expect(approximateMapUrl({ ...fix, accuracy: 20 })).toBeUndefined();
});
