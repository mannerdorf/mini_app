import { expect, it } from "vitest";
import { densityBands, densityHue, densityScale } from "./density";
import type { Placement } from "./model";
const p = (extra: Partial<Placement> = {}): Placement => ({ cargoId: "a", unit: "a/0/0", compartment: 0, x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weight: 100, density: 100, pallet: false, estimated: false, support: null, topLoad: 0, maxTopLoad: 0, ...extra });
it("splits mass and volume of a box across height bands without double counting", () => {
  const bands = densityBands([p({ height: 3, weight: 300 })], 3);
  expect(bands.map(b => b.mass)).toEqual([100, 100, 100]);
  expect(bands.map(b => b.volume)).toEqual([1, 1, 1]);
  expect(bands.map(b => b.density)).toEqual([100, 100, 100]);
});
it("shows occupied density by height, preserving empty bands", () => {
  const bands = densityBands([p({ weight: 500, density: 500 }), p({ z: 1, weight: 10, density: 10 })], 3);
  expect(bands.map(b => b.density)).toEqual([500, 10, null]);
});
it("scales colors to the actual plan and handles equal or empty densities", () => {
  expect(densityScale([p(), p({ density: 500 })])).toEqual({ min: 100, max: 500 });
  expect(densityHue(100, 100, 500)).toBe(0.58);
  expect(densityHue(500, 100, 500)).toBe(0);
  expect(Number.isFinite(densityHue(100, 100, 100))).toBe(true);
  expect(densityScale([])).toEqual({ min: 0, max: 0 });
});
