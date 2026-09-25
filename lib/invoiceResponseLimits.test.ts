import { describe, expect, it } from "vitest";
import { clampDateFromToMaxSpan, daysBetweenInclusive } from "./invoiceResponseLimits.js";

describe("invoiceResponseLimits", () => {
  it("counts inclusive days", () => {
    expect(daysBetweenInclusive("2026-01-01", "2026-01-01")).toBe(1);
    expect(daysBetweenInclusive("2026-01-01", "2026-12-31")).toBe(365);
  });

  it("clamps a calendar year to the last 62 days (1C upstream only)", () => {
    const from = clampDateFromToMaxSpan("2026-01-01", "2026-12-31", 62);
    expect(from).toBe("2026-10-31");
    expect(daysBetweenInclusive(from, "2026-12-31")).toBe(62);
  });

  it("does not clamp ranges within the limit", () => {
    expect(clampDateFromToMaxSpan("2026-08-01", "2026-09-30", 62)).toBe("2026-08-01");
  });
});
