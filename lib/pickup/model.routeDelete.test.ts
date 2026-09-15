import { describe, expect, it } from "vitest";
import { pickupRouteCanDelete } from "./model";

describe("pickupRouteCanDelete", () => {
  it("allows delete for draft and published only", () => {
    expect(pickupRouteCanDelete("draft")).toBe(true);
    expect(pickupRouteCanDelete("published")).toBe(true);
    expect(pickupRouteCanDelete("started")).toBe(false);
    expect(pickupRouteCanDelete("completed")).toBe(false);
  });
});
