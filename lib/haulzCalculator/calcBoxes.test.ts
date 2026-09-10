import { describe, expect, it } from "vitest";
import { calcBoxesQuote } from "./calcBoxes.js";
import { DEFAULT_BOXES } from "./defaultBoxes.js";
import type { ParcelPlace } from "./types.js";

describe("calcBoxesQuote", () => {
  it("charges default price per place with box required", () => {
    const places: ParcelPlace[] = [
      { weightKg: 50, volumeM3: 0.5, lengthCm: 80, widthCm: 80, heightCm: 78, boxRequired: true, boxSize: "XL" },
    ];
    const line = calcBoxesQuote(places, DEFAULT_BOXES);
    expect(line?.label).toBe("Коробки");
    expect(line?.amountRub).toBe(100);
    expect(line?.meta?.count).toBe(1);
  });

  it("sums prices for multiple places and sizes", () => {
    const custom = {
      sizes: DEFAULT_BOXES.sizes.map((s) =>
        s.code === "XS" ? { ...s, price_rub: 50 } : s.code === "XL" ? { ...s, price_rub: 150 } : s,
      ),
    };
    const places: ParcelPlace[] = [
      { weightKg: 1, volumeM3: 0.005, boxRequired: true, boxSize: "XS" },
      { weightKg: 50, volumeM3: 0.5, boxRequired: true, boxSize: "XL" },
    ];
    const line = calcBoxesQuote(places, custom);
    expect(line?.amountRub).toBe(200);
    expect(line?.meta?.count).toBe(2);
  });

  it("returns null when no place requires a box", () => {
    expect(calcBoxesQuote([{ weightKg: 10, volumeM3: 0.1 }], DEFAULT_BOXES)).toBeNull();
    expect(calcBoxesQuote([], DEFAULT_BOXES)).toBeNull();
  });
});
