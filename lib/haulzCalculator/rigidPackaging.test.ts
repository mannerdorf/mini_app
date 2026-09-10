import { describe, expect, it } from "vitest";
import { DEFAULT_RIGID_PACKAGING } from "./defaultRigidPackaging.js";
import { calcRigidPackagingQuote } from "./rigidPackaging.js";
import type { ParcelPlace } from "./types.js";

describe("calcRigidPackagingQuote", () => {
  it("charges ceil(height) meters plus pallet price for a single place", () => {
    const line = calcRigidPackagingQuote(
      [{ weightKg: 100, lengthCm: 100, widthCm: 80, heightCm: 150, volumeM3: 1.2 }],
      DEFAULT_RIGID_PACKAGING,
    );
    expect(line?.label).toBe("Жесткая упаковка");
    expect(line?.amountRub).toBe(3650);
    expect(line?.meta?.palletType).toBe("1200x800");
  });

  it("picks the cheapest pallet type", () => {
    const line = calcRigidPackagingQuote(
      [{ weightKg: 10, lengthCm: 50, widthCm: 40, heightCm: 50, volumeM3: 0.1 }],
      DEFAULT_RIGID_PACKAGING,
    );
    expect(line?.amountRub).toBe(1100);
    expect(line?.meta?.palletType).toBe("600x400");
  });

  it("uses multiple pallets when floor space requires it", () => {
    const places: ParcelPlace[] = [
      { weightKg: 100, lengthCm: 110, widthCm: 90, heightCm: 100, volumeM3: 0.99 },
      { weightKg: 100, lengthCm: 110, widthCm: 90, heightCm: 100, volumeM3: 0.99 },
    ];
    const line = calcRigidPackagingQuote(places, DEFAULT_RIGID_PACKAGING);
    expect(line?.meta?.palletCount).toBe(2);
    expect(line?.amountRub).toBeGreaterThan(4350);
  });

  it("returns null when packaging is disabled or config missing", () => {
    expect(calcRigidPackagingQuote([], DEFAULT_RIGID_PACKAGING)).toBeNull();
    expect(calcRigidPackagingQuote([{ weightKg: 1, volumeM3: 0.01 }], null)).toBeNull();
  });
});
