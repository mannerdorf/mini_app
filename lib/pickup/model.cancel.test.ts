import { describe, expect, it } from "vitest";
import { pickupJobCanCancel } from "./model";

describe("pickupJobCanCancel", () => {
  it("allows cancel before pickup result", () => {
    expect(pickupJobCanCancel("pending")).toBe(true);
    expect(pickupJobCanCancel("arrived")).toBe(true);
    expect(pickupJobCanCancel("problem")).toBe(true);
  });
  it("blocks cancel after pickup or terminal states", () => {
    expect(pickupJobCanCancel("picked_up")).toBe(false);
    expect(pickupJobCanCancel("cancelled")).toBe(false);
  });
});
