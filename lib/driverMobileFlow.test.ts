import { describe, expect, it } from "vitest";
import type { Job, Route } from "./pickup/model";
import { driverMobilePhase } from "../src/features/pickup/driverMobileFlow";

const baseRoute = (status: Route["status"], extra: Partial<Route> = {}): Route =>
  ({
    id: "r1",
    name: "R1",
    date: "2026-09-16",
    status,
    version: 2,
    acknowledged_version: 2,
    start_time: "09:00",
    driver_id: "d1",
    vehicle_id: "v1",
    depot_id: "dep1",
    snapshot: { driver: null, vehicle: null, depot: null },
    ...extra,
  }) as Route;

const job = (id: string, status: Job["status"], resolution?: string): Job =>
  ({
    id,
    route_id: "r1",
    status,
    version: 1,
    resolution: resolution ?? null,
    data: {
      senderName: "Sender",
      address: "Addr",
      windowFrom: "10:00",
      windowTo: "12:00",
      places: [{ count: 1, kind: "box" }],
    },
  }) as Job;

describe("driverMobilePhase", () => {
  it("prioritizes outbox sync", () => {
    const route = baseRoute("started");
    expect(driverMobilePhase(route, [job("j1", "pending")], { outboxCount: 2 })).toBe(
      "sync",
    );
  });

  it("published before start", () => {
    expect(driverMobilePhase(baseRoute("published"), [], { outboxCount: 0 })).toBe(
      "published",
    );
  });

  it("requires ack after dispatcher edit", () => {
    const route = baseRoute("started", { version: 3, acknowledged_version: 2 });
    expect(driverMobilePhase(route, [job("j1", "pending")], { outboxCount: 0 })).toBe(
      "ack",
    );
  });

  it("shows current stop when pending", () => {
    const route = baseRoute("started");
    expect(
      driverMobilePhase(route, [job("j1", "pending")], { outboxCount: 0 }),
    ).toBe("on_stop");
  });

  it("waits for dispatcher on unresolved problem", () => {
    const route = baseRoute("started");
    expect(
      driverMobilePhase(route, [job("j1", "problem")], { outboxCount: 0 }),
    ).toBe("wait_dispatcher");
  });
});
