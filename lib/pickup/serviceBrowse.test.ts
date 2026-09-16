import { describe, it, expect } from "vitest";
import {
  pickupDriverServiceBrowse,
  pickupSnapshotSeeAllRoutes,
} from "./serviceBrowse";

describe("pickup service browse", () => {
  it("requires driver badge and service_mode", () => {
    expect(
      pickupDriverServiceBrowse({
        driver: true,
        permissions: { service_mode: true },
      }),
    ).toBe(true);
    expect(
      pickupDriverServiceBrowse({ driver: true, permissions: {} }),
    ).toBe(false);
    expect(
      pickupDriverServiceBrowse({
        driver: false,
        permissions: { service_mode: true },
      }),
    ).toBe(false);
  });
  it("see all routes for dispatcher or flagged service browse", () => {
    const driver = {
      driver: true,
      dispatcher: false,
      permissions: { service_mode: true },
    };
    expect(pickupSnapshotSeeAllRoutes(driver, false)).toBe(false);
    expect(pickupSnapshotSeeAllRoutes(driver, true)).toBe(true);
    expect(
      pickupSnapshotSeeAllRoutes(
        { driver: false, dispatcher: true, permissions: {} },
        false,
      ),
    ).toBe(true);
  });
});
