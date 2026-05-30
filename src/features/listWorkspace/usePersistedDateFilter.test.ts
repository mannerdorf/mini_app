import { describe, expect, it } from "vitest";
import { formatDateFilterButtonLabel } from "./formatDateFilterLabel";

describe("formatDateFilterButtonLabel", () => {
  it("capitalizes preset filters", () => {
    expect(
      formatDateFilterButtonLabel({
        dateFilter: "сегодня",
        apiDateRange: { dateFrom: "2026-01-01", dateTo: "2026-01-01" },
        selectedMonthForFilter: null,
        selectedYearForFilter: null,
        selectedWeekForFilter: null,
      })
    ).toBe("Сегодня");
  });

  it("shows period label", () => {
    expect(
      formatDateFilterButtonLabel({
        dateFilter: "период",
        apiDateRange: { dateFrom: "2026-01-01", dateTo: "2026-01-31" },
        selectedMonthForFilter: null,
        selectedYearForFilter: null,
        selectedWeekForFilter: null,
      })
    ).toBe("Период");
  });
});
