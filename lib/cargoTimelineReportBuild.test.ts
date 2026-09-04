import { describe, expect, it } from "vitest";
import { CARGO_TIMELINE_MAX_PERIOD_DAYS, parseCargoTimelineReportParams } from "./cargoTimelineReportBuild.js";

describe("parseCargoTimelineReportParams", () => {
  it("rejects periods longer than one week", () => {
    const result = parseCargoTimelineReportParams({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-09",
    });
    expect(result).toEqual({
      error: `Период не может быть больше ${CARGO_TIMELINE_MAX_PERIOD_DAYS} дней`,
    });
  });

  it("accepts a full calendar week", () => {
    const result = parseCargoTimelineReportParams({
      dateFrom: "2026-08-24",
      dateTo: "2026-08-30",
    });
    expect(result).toEqual({
      dateFrom: "2026-08-24",
      dateTo: "2026-08-30",
      routeFilter: "MSK-KGD",
      delayFilter: "all",
    });
  });

  it("defaults route to MSK-KGD", () => {
    const result = parseCargoTimelineReportParams({
      dateFrom: "2026-08-24",
      dateTo: "2026-08-30",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.routeFilter).toBe("MSK-KGD");
  });
});
