import { describe, expect, it } from "vitest";
import { pickupRouteDeleteAllowed } from "./deleteRoute";
import {
  pickupRouteCanDelete,
  pickupRouteCanSuperAdminDeleteCompleted,
} from "./model";

describe("pickupRouteCanDelete", () => {
  it("allows delete in any route status", () => {
    expect(pickupRouteCanDelete("draft")).toBe(true);
    expect(pickupRouteCanDelete("published")).toBe(true);
    expect(pickupRouteCanDelete("started")).toBe(false);
    expect(pickupRouteCanDelete("completed")).toBe(true);
  });
});

describe("pickupRouteCanSuperAdminDeleteCompleted", () => {
  it("allows only completed", () => {
    expect(pickupRouteCanSuperAdminDeleteCompleted("completed")).toBe(true);
    expect(pickupRouteCanSuperAdminDeleteCompleted("started")).toBe(false);
  });
});

describe("pickupRouteDeleteAllowed", () => {
  it("maps policies to statuses", () => {
    expect(pickupRouteDeleteAllowed("completed", "super_admin_completed")).toBe(true);
    expect(pickupRouteDeleteAllowed("draft", "super_admin_completed")).toBe(false);
  });
});
