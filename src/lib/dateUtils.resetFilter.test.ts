import { describe, expect, it } from "vitest";
import { getResetDateFilterState, getTodayDate } from "./dateUtils";

describe("getResetDateFilterState", () => {
  it("sets today preset", () => {
    const today = getTodayDate();
    const state = getResetDateFilterState();
    expect(state.dateFilter).toBe("сегодня");
    expect(state.customDateFrom).toBe(today);
    expect(state.customDateTo).toBe(today);
    expect(state.selectedQuarterForFilter).toBeNull();
    expect(state.selectedYearForFilter).toBeNull();
    expect(state.selectedWeekForFilter).toBeNull();
  });
});
