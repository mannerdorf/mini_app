import { describe, expect, it } from "vitest";
import { expandPickupScheduleDates } from "./pickupSchedule";

describe("expandPickupScheduleDates", () => {
  it("returns single date for once mode", () => {
    expect(
      expandPickupScheduleDates({ mode: "once", startDate: "2026-09-15" }),
    ).toEqual(["2026-09-15"]);
  });

  it("expands weekdays in range", () => {
    const dates = expandPickupScheduleDates({
      mode: "periodic",
      pattern: "weekdays",
      startDate: "2026-09-15",
      until: "2026-09-22",
      weekdays: [1, 3, 5],
    });
    expect(dates).toEqual(["2026-09-16", "2026-09-18", "2026-09-21"]);
  });

  it("uses explicit date list", () => {
    expect(
      expandPickupScheduleDates({
        mode: "periodic",
        pattern: "dates",
        startDate: "2026-09-01",
        dates: ["2026-09-20", "2026-09-15", "2026-09-20"],
      }),
    ).toEqual(["2026-09-15", "2026-09-20"]);
  });
});
