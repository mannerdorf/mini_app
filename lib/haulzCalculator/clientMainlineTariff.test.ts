import { describe, expect, it } from "vitest";
import {
  directionCityCodes,
  transportTypeToMainlineMode,
} from "./clientMainlineTariff.js";
import { formatTariffBasisFootnote } from "./tariffBasisFootnote.js";

describe("clientMainlineTariff", () => {
  it("maps direction to MSK/KGD city codes", () => {
    expect(directionCityCodes("mow_kgd")).toEqual({ from: "MSK", to: "KGD" });
    expect(directionCityCodes("kgd_mow")).toEqual({ from: "KGD", to: "MSK" });
  });

  it("maps transport type to mainline mode", () => {
    expect(transportTypeToMainlineMode("Паром")).toBe("ferry");
    expect(transportTypeToMainlineMode("Авто")).toBe("auto");
    expect(transportTypeToMainlineMode("")).toBeNull();
  });
});

describe("formatTariffBasisFootnote", () => {
  it("formats tariff and contract references", () => {
    expect(
      formatTariffBasisFootnote({
        tariffNumber: "Т-12",
        tariffDate: "2025-02-01T00:00:00.000Z",
        contractNumber: "8888",
        contractDate: "2024-11-15T00:00:00.000Z",
        pricePerKg: 710,
      }),
    ).toBe("На основе согласованного тарифа №Т-12 от 01.02.2025 по договору №8888 от 15.11.2024 · 710 ₽/кг");
  });

  it("omits missing dates", () => {
    expect(
      formatTariffBasisFootnote({
        tariffNumber: "Т-12",
        tariffDate: null,
        contractNumber: "8888",
        contractDate: null,
      }),
    ).toBe("На основе согласованного тарифа №Т-12 по договору №8888");
  });
});
