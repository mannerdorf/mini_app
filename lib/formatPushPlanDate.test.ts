import { describe, expect, it } from "vitest";
import { formatPushPlanDateDisplay } from "./formatPushPlanDate.js";

describe("formatPushPlanDateDisplay", () => {
  it("formats ISO date", () => {
    expect(formatPushPlanDateDisplay("2026-08-28")).toBe("28.08.2026");
  });

  it("keeps russian dotted date", () => {
    expect(formatPushPlanDateDisplay("28.08.2026")).toBe("28.08.2026");
  });

  it("returns dash for empty", () => {
    expect(formatPushPlanDateDisplay("")).toBe("—");
    expect(formatPushPlanDateDisplay(null)).toBe("—");
  });
});
