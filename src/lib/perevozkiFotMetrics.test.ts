import { describe, expect, it } from "vitest";
import { aggregatePerevozkiFotMetrics } from "./perevozkiFotMetrics";

describe("aggregatePerevozkiFotMetrics", () => {
  it("sums PW and Sum excluding received-info rows", () => {
    const metrics = aggregatePerevozkiFotMetrics([
      { State: "В пути", PW: 1000, Sum: 50000 },
      { State: "Доставлена", PW: "800", Sum: "32000" },
      { State: "Получена информация", PW: 999, Sum: 99999 },
    ]);
    expect(metrics.paidWeight).toBe(1800);
    expect(metrics.sales).toBe(82000);
  });
});
