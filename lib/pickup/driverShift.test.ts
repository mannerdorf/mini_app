import { describe, it, expect } from "vitest";
import {
  driverHasWorkShift,
  driverHasInvalidWorkShift,
  driverShiftEnd,
  driverShiftStart,
} from "./driverShift";

describe("driverShift", () => {
  it("treats missing shift as full day", () => {
    expect(driverHasWorkShift({})).toBe(false);
    expect(driverShiftStart({})).toBe("00:00");
    expect(driverShiftEnd({})).toBe("23:59");
  });
  it("uses configured shift when present", () => {
    const data = { from: "09:00", to: "18:00" };
    expect(driverHasWorkShift(data)).toBe(true);
    expect(driverShiftStart(data)).toBe("09:00");
    expect(driverShiftEnd(data)).toBe("18:00");
  });
  it("separates missing shifts from invalid and overnight shifts", () => {
    expect(driverHasInvalidWorkShift({})).toBe(false);
    expect(driverHasInvalidWorkShift({ from: "09:00" })).toBe(true);
    expect(driverHasInvalidWorkShift({ from: "22:00", to: "06:00" })).toBe(true);
    expect(driverHasInvalidWorkShift({ from: "09:00", to: "18:00" })).toBe(false);
  });
});
