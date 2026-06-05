import { describe, expect, it } from "vitest";
import {
  describeTariffVersionPayload,
  formatTariffDateRu,
  tariffSetSelectLabel,
} from "./tariffVersionSummary.js";

describe("tariffVersionSummary", () => {
  it("formats date in Russian", () => {
    expect(formatTariffDateRu("2026-06-05")).toMatch(/5.*2026/);
  });

  it("describes extras in plain language", () => {
    const lines = describeTariffVersionPayload("calc_extras", "extras", {
      services: [
        {
          code: "declared_value",
          label: "Объявленная ценность",
          pricing_type: "percent_of_declared_value",
          percent: 0.5,
          enabled: true,
        },
      ],
    });
    expect(lines.some((l) => l.includes("Объявленная ценность"))).toBe(true);
    expect(lines.some((l) => l.includes("0.5%"))).toBe(true);
  });

  it("describes mainline", () => {
    const lines = describeTariffVersionPayload("mainline_mow_kgd_ferry", "mainline", {
      mode: "ferry",
      direction: "mow_kgd",
      price_per_kg: 35,
      delivery_days: 12,
    });
    expect(lines[0]).toContain("Москва → Калининград");
    expect(lines[0]).toContain("35 ₽/кг");
  });

  it("uses friendly select labels", () => {
    expect(tariffSetSelectLabel({ code: "calc_extras", name: "Доп. услуги", block: "extras" })).toBe(
      "Доп. услуги",
    );
    expect(tariffSetSelectLabel({ code: "pickup_matrix", name: "pickup_matrix", block: "pickup" })).toBe(
      "Забор (Москва и Калининград)",
    );
  });
});
