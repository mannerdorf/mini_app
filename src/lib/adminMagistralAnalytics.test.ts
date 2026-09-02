import { describe, expect, it } from "vitest";
import { buildMagistralAnalysis, getMagistralTransitDays } from "./adminMagistralAnalytics";
import type { CargoItem } from "../types";

describe("getMagistralTransitDays", () => {
  it("returns calendar days between DatePrih and DateVr", () => {
    const item = { DatePrih: "2026-01-01", DateVr: "2026-01-08" } as CargoItem;
    expect(getMagistralTransitDays(item)).toBe(7);
  });

  it("returns null when dates missing", () => {
    expect(getMagistralTransitDays({ DatePrih: "2026-01-01" } as CargoItem)).toBeNull();
  });
});

describe("buildMagistralAnalysis", () => {
  it("aggregates min avg max by transport type", () => {
    const items = [
      { DatePrih: "2026-01-01", DateVr: "2026-01-08", AK: false },
      { DatePrih: "2026-01-01", DateVr: "2026-01-15", AK: false },
      { DatePrih: "2026-01-01", DateVr: "2026-01-22", AK: true },
      { DatePrih: "2026-01-01", DateVr: "2026-01-31", AK: true },
    ] as CargoItem[];

    const result = buildMagistralAnalysis(items);
    const auto = result.byType.find((r) => r.type === "auto")!;
    const ferry = result.byType.find((r) => r.type === "ferry")!;

    expect(auto.count).toBe(2);
    expect(auto.minDays).toBe(7);
    expect(auto.maxDays).toBe(14);
    expect(auto.avgDays).toBe(10.5);

    expect(ferry.count).toBe(2);
    expect(ferry.minDays).toBe(21);
    expect(ferry.maxDays).toBe(30);
    expect(ferry.avgDays).toBe(25.5);

    expect(result.completedCount).toBe(4);
    expect(result.skippedIncomplete).toBe(0);
  });
});
