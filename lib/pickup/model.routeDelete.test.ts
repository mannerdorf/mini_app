import { describe, expect, it } from "vitest";
import { pickupRouteDeleteAllowed } from "./deleteRoute";
import {
  pickupRouteCanDelete,
  pickupRouteCanSuperAdminDeleteCompleted,
} from "./model";

describe("pickupRouteCanDelete", () => {
  it("allows delete for draft, published and started", () => {
    expect(pickupRouteCanDelete("draft")).toBe(true);
    expect(pickupRouteCanDelete("published")).toBe(true);
    expect(pickupRouteCanDelete("started")).toBe(true);
    expect(pickupRouteCanDelete("completed")).toBe(false);
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
