import { describe, expect, it } from "vitest";
import { pickupJobCanDelete } from "./model";

describe("pickupJobCanDelete", () => {
  it("allows delete for pending and cancelled only", () => {
    expect(pickupJobCanDelete("pending")).toBe(true);
    expect(pickupJobCanDelete("cancelled")).toBe(true);
    expect(pickupJobCanDelete("arrived")).toBe(false);
    expect(pickupJobCanDelete("picked_up")).toBe(false);
  });
});
