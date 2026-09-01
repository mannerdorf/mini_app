import { describe, expect, it } from "vitest";
import { cargoPlannedDeliveryDateFromItem } from "./cargoDateFilter.js";

describe("cargoPlannedDeliveryDateFromItem", () => {
  it("reads DateArrivalPlan from cache payload", () => {
    expect(
      cargoPlannedDeliveryDateFromItem({
        Number: "000141572",
        DateArrivalPlan: "2026-08-28",
      }),
    ).toBe("2026-08-28");
  });

  it("prefers earliest valid plan date", () => {
    expect(
      cargoPlannedDeliveryDateFromItem({
        DateArrivalPlan: "2026-09-01",
        PlanDate: "2026-08-28",
      }),
    ).toBe("2026-08-28");
  });
});
