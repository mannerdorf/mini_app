import { describe, expect, it } from "vitest";
import {
  buildMagistralAnalysis,
  buildMagistralDeliveryWithinDays,
  buildMagistralDetailRows,
  filterMagistralItemsByRoute,
  getMagistralTransitDays,
} from "./adminMagistralAnalytics";
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

describe("filterMagistralItemsByRoute", () => {
  it("keeps items matching MSK-KGD by city codes", () => {
    const items = [
      { CitySender: "Москва", CityReceiver: "Калининград", DatePrih: "2026-01-01", DateVr: "2026-01-08" },
      { CitySender: "Калининград", CityReceiver: "Москва", DatePrih: "2026-01-01", DateVr: "2026-01-08" },
    ] as CargoItem[];

    const filtered = filterMagistralItemsByRoute(items, "MSK-KGD");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.CitySender).toBe("Москва");
  });

  it("returns all items when route filter is all", () => {
    const items = [
      { CitySender: "Москва", CityReceiver: "Калининград" },
      { CitySender: "Калининград", CityReceiver: "Москва" },
    ] as CargoItem[];
    expect(filterMagistralItemsByRoute(items, "all")).toHaveLength(2);
  });
});

describe("buildMagistralDeliveryWithinDays", () => {
  it("returns cumulative non-zero delivery percentages by day", () => {
    const items = [
      { DatePrih: "2026-01-01", DateVr: "2026-01-02", AK: false },
      { DatePrih: "2026-01-01", DateVr: "2026-01-05", AK: false },
      { DatePrih: "2026-01-01", DateVr: "2026-01-05", AK: false },
      { DatePrih: "2026-01-01", DateVr: "2026-01-09", AK: false },
      { DatePrih: "2026-01-01", DateVr: "2026-01-16", AK: true },
    ] as CargoItem[];

    const result = buildMagistralDeliveryWithinDays(items);
    const auto = result.byType.find((row) => row.type === "auto")!;

    expect(auto.total).toBe(4);
    expect(auto.buckets).toEqual([
      { day: 1, percent: 25, count: 1 },
      { day: 4, percent: 75, count: 3 },
      { day: 8, percent: 100, count: 4 },
    ]);
    expect(auto.buckets.every((bucket) => bucket.percent > 0)).toBe(true);
  });
});

describe("buildMagistralDetailRows", () => {
  it("returns sorted rows for transport type", () => {
    const items = [
      { Number: "10001", DatePrih: "2025-01-01", DateVr: "2026-02-01", AK: false, Customer: "ООО Альфа" },
      { Number: "10002", DatePrih: "2026-01-01", DateVr: "2026-01-08", AK: false, Customer: "ООО Бета" },
      { Number: "10003", DatePrih: "2026-01-01", DateVr: "2026-01-15", AK: true },
    ] as CargoItem[];

    const rows = buildMagistralDetailRows(items, "auto");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.cargoNumber).toBe("10001");
    expect(rows[0]?.transitDays).toBeGreaterThan(300);
    expect(rows[1]?.cargoNumber).toBe("10002");
  });
});
