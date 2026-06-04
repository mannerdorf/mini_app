import { describe, expect, it } from "vitest";
import {
  computeChargeableWeight,
  summarizePlaces,
} from "./chargeableWeight.js";
import {
  haversineKm,
  isInsideRingPolygon,
  pointInPolygon,
  pickTopExitsByHaversine,
  polygonFromExitsCatalogOrder,
  ringFromExits,
} from "./mkadDistance.js";
import { calcPickupCityFee, resolveTierIndex } from "./pickupTariff.js";
import { isLastMileLegCharged, isPickupLegCharged, resolveDirection } from "./quoteEngine.js";
import { parsePickupXlsxFile } from "./pickupXlsxParser.js";
import path from "node:path";
import type { PickupTier, RingExitRow } from "./types.js";

describe("chargeableWeight", () => {
  it("uses max of actual and volumetric", () => {
    expect(computeChargeableWeight(157, 1, 200)).toBe(200);
    expect(computeChargeableWeight(250, 1, 200)).toBe(250);
  });

  it("summarizes places", () => {
    const s = summarizePlaces([
      { weightKg: 100, volumeM3: 0.5 },
      { weightKg: 57, volumeM3: 0.5 },
    ]);
    expect(s.actualWeightKg).toBe(157);
    expect(s.volumeM3).toBe(1);
    expect(s.chargeableWeightKg).toBe(200);
  });
});

describe("pickupTariff", () => {
  const tiers: PickupTier[] = [
    { weight_max_kg: 100, volume_max_m3: 0.5, city_fee: 1350, per_km: 23 },
    { weight_max_kg: 500, volume_max_m3: 2, city_fee: 2000, per_km: 30 },
  ];

  it("picks max tier by weight and volume", () => {
    expect(resolveTierIndex(50, 0.3, tiers)).toBe(0);
    expect(resolveTierIndex(200, 0.3, tiers)).toBe(1);
    expect(resolveTierIndex(50, 1.5, tiers)).toBe(1);
  });

  it("calculates city fee + per km", () => {
    const r = calcPickupCityFee({ tiers }, 50, 0.3, 10);
    expect(r.cityFee).toBe(1350);
    expect(r.perKmFee).toBe(230);
    expect(r.total).toBe(1580);
  });
});

describe("mkadDistance", () => {
  it("haversine is symmetric", () => {
    const a = { lat: 55.75, lon: 37.62 };
    const b = { lat: 55.91, lon: 37.59 };
    expect(haversineKm(a, b)).toBeGreaterThan(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 5);
  });

  it("point in simple square", () => {
    const ring = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 10 },
      { lat: 10, lon: 10 },
      { lat: 10, lon: 0 },
    ];
    expect(pointInPolygon({ lat: 5, lon: 5 }, ring)).toBe(true);
    expect(pointInPolygon({ lat: 15, lon: 5 }, ring)).toBe(false);
  });

  it("pickTopExits returns nearest", () => {
    const exits: RingExitRow[] = [
      { id: 1, city_code: "moscow", code: "A", name: "A", lat: 55.8, lon: 37.5, active: true, sort_order: 0 },
      { id: 2, city_code: "moscow", code: "B", name: "B", lat: 56.0, lon: 38.0, active: true, sort_order: 1 },
    ];
    const top = pickTopExitsByHaversine({ lat: 55.81, lon: 37.51 }, exits, 1);
    expect(top[0]?.code).toBe("A");
  });

  it("isInsideRingPolygon uses catalog order polygon", () => {
    const exits: RingExitRow[] = [
      { id: 1, city_code: "moscow", code: "A", name: "A", lat: 0, lon: 0, active: true, sort_order: 0 },
      { id: 2, city_code: "moscow", code: "B", name: "B", lat: 0, lon: 10, active: true, sort_order: 1 },
      { id: 3, city_code: "moscow", code: "C", name: "C", lat: 10, lon: 10, active: true, sort_order: 2 },
      { id: 4, city_code: "moscow", code: "D", name: "D", lat: 10, lon: 0, active: true, sort_order: 3 },
    ];
    const ring = polygonFromExitsCatalogOrder(exits);
    expect(isInsideRingPolygon({ lat: 5, lon: 5 }, ring, [])).toBe(true);
    expect(isInsideRingPolygon({ lat: 15, lon: 5 }, ring, [])).toBe(false);
  });

  it("ringFromExits builds closed ordering", () => {
    const exits: RingExitRow[] = [
      { id: 1, city_code: "moscow", code: "A", name: "A", lat: 1, lon: 0, active: true, sort_order: 0 },
      { id: 2, city_code: "moscow", code: "B", name: "B", lat: 0, lon: 1, active: true, sort_order: 1 },
      { id: 3, city_code: "moscow", code: "C", name: "C", lat: -1, lon: 0, active: true, sort_order: 2 },
    ];
    expect(ringFromExits(exits).length).toBe(3);
  });
});

describe("quoteEngine direction", () => {
  it("infers mow_kgd from Moscow address", () => {
    const d = resolveDirection(
      { label: "Москва", fullAddress: "Москва, Ленинский", point: { lat: 55.7, lon: 37.6 } },
      { label: "КГД", fullAddress: "Калининград", point: { lat: 54.7, lon: 20.5 } },
    );
    expect(d).toBe("mow_kgd");
  });
});

describe("quoteEngine leg charges", () => {
  it("skips pickup when sending from warehouse (point)", () => {
    expect(isPickupLegCharged({ fromParty: { mode: "point" } })).toBe(false);
    expect(isPickupLegCharged({ fromParty: { mode: "courier" } })).toBe(true);
    expect(isPickupLegCharged({})).toBe(true);
  });

  it("skips last mile when delivering to warehouse (point)", () => {
    expect(isLastMileLegCharged({ toParty: { mode: "point" } })).toBe(false);
    expect(isLastMileLegCharged({ toParty: { mode: "courier" } })).toBe(true);
    expect(isLastMileLegCharged({})).toBe(true);
  });
});

describe("pickupXlsxParser", () => {
  it("parses пикап.xlsx tiers from seed dir", () => {
    const file = path.join(process.cwd(), "data/haulz-calculator-seed/пикап.xlsx");
    const parsed = parsePickupXlsxFile(file);
    expect(parsed?.moscow.length).toBe(12);
    expect(parsed?.moscow[0]?.city_fee).toBe(1350);
    expect(parsed?.kaliningrad[3]?.per_km).toBe(28);
  });
});
