import { describe, expect, it } from "vitest";
import type { Job, Route } from "../../../lib/pickup/model";
import { matchesDayFilter, matchesDaySearch } from "./dayPlan";
const job = {
  status: "pending",
  route_id: null,
  resolution: null,
  data: {
    senderName: "НВ-ЛАБ",
    customerName: "МИТАЛ",
    address: "Москва, шоссе Энтузиастов, 56",
    zayavkaNumber: "123",
  },
} as Job;
describe("dispatch day plan", () => {
  it("excludes cancelled pickups from active counters and keeps a dedicated filter", () => {
    const cancelled = { ...job, status: "cancelled" } as Job;
    for (const filter of [
      "all",
      "unassigned",
      "collected",
      "attention",
    ] as const)
      expect(matchesDayFilter(cancelled, filter)).toBe(false);
    expect(matchesDayFilter(cancelled, "cancelled")).toBe(true);
  });
  it("only shows unresolved discrepancies as requiring a decision", () => {
    expect(matchesDayFilter({ ...job, status: "partial" }, "attention")).toBe(
      true,
    );
    expect(
      matchesDayFilter(
        { ...job, status: "partial", resolution: "Согласовано" },
        "attention",
      ),
    ).toBe(false);
    expect(matchesDayFilter({ ...job, route_id: "route" }, "unassigned")).toBe(
      false,
    );
  });
  it("searches multiple words across business fields and assigned driver", () => {
    expect(matchesDaySearch(job, "  митал   123 ", [])).toBe(true);
    expect(matchesDaySearch(job, "Иванов", [])).toBe(false);
    const routes = [
      { id: "route", name: "Восток", snapshot: { driver: { name: "Иванов" } } },
    ] as Route[];
    expect(
      matchesDaySearch(
        { ...job, route_id: "route" },
        "иванов энтузиастов",
        routes,
      ),
    ).toBe(true);
  });
});
