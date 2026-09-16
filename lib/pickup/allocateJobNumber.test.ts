import { describe, expect, it } from "vitest";
import { formatPickupJobNumber } from "./allocateJobNumber";

describe("formatPickupJobNumber", () => {
  it("pads sequence to six digits", () => {
    expect(formatPickupJobNumber(1)).toBe("ZB-000001");
    expect(formatPickupJobNumber(123456)).toBe("ZB-123456");
  });
});
