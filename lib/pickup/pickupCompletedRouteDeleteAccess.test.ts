import { describe, expect, it } from "vitest";
import {
  pickupMayDeleteCompletedRoute,
  pickupRouteCanDeleteInDispatchApp,
} from "./pickupCompletedRouteDeleteAccess";

describe("pickupMayDeleteCompletedRoute", () => {
  it("requires all four service permissions", () => {
    expect(
      pickupMayDeleteCompletedRoute({
        cms_access: true,
        service_mode: true,
        analytics: true,
        haulz: true,
        dispatcher: true,
      }),
    ).toBe(true);
    expect(
      pickupMayDeleteCompletedRoute({
        cms_access: true,
        service_mode: true,
        analytics: true,
        haulz: false,
      }),
    ).toBe(false);
  });
});

describe("pickupRouteCanDeleteInDispatchApp", () => {
  const power = {
    cms_access: true,
    service_mode: true,
    analytics: true,
    haulz: true,
  };

  it("allows draft for any dispatcher", () => {
    expect(pickupRouteCanDeleteInDispatchApp("draft", {})).toBe(true);
  });

  it("allows completed only with full service permissions", () => {
    expect(pickupRouteCanDeleteInDispatchApp("completed", power)).toBe(true);
    expect(pickupRouteCanDeleteInDispatchApp("completed", {})).toBe(false);
    expect(pickupRouteCanDeleteInDispatchApp("started", power)).toBe(false);
  });
});
