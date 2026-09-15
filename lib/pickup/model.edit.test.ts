import { describe, expect, it } from "vitest";
import { pickupJobCanEdit } from "./model";

describe("pickupJobCanEdit", () => {
  it("allows edit only for pending", () => {
    expect(pickupJobCanEdit("pending")).toBe(true);
    expect(pickupJobCanEdit("arrived")).toBe(false);
    expect(pickupJobCanEdit("picked_up")).toBe(false);
    expect(pickupJobCanEdit("cancelled")).toBe(false);
  });
});
