import { describe, expect, it } from "vitest";
import { getCalendarQuarter, getQuarterRange, resolveDateFilterToRange } from "./dateUtils";

describe("quarter date filter", () => {
  it("maps months to calendar quarter", () => {
    expect(getCalendarQuarter(new Date("2026-01-15"))).toBe(1);
    expect(getCalendarQuarter(new Date("2026-08-01"))).toBe(3);
  });

  it("returns full quarter range", () => {
    expect(getQuarterRange(2026, 2)).toEqual({ dateFrom: "2026-04-01", dateTo: "2026-06-30" });
    expect(getQuarterRange(2026, 4)).toEqual({ dateFrom: "2026-10-01", dateTo: "2026-12-31" });
  });

  it("resolves квартал preset", () => {
    expect(
      resolveDateFilterToRange("квартал", {
        customDateFrom: "",
        customDateTo: "",
        selectedMonthForFilter: null,
        selectedQuarterForFilter: { year: 2026, quarter: 1 },
        selectedYearForFilter: null,
        selectedWeekForFilter: null,
      }),
    ).toEqual({ dateFrom: "2026-01-01", dateTo: "2026-03-31" });
  });
});
