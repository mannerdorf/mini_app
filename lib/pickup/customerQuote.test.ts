import { describe, expect, it } from "vitest";
import { calcPickupFromMatrix } from "../haulzCalculator/pickupTariff.js";
import type { PickupMatrixPayload } from "../haulzCalculator/types.js";

const sampleMatrix: PickupMatrixPayload = {
  scope: "pickup",
  cities: {
    moscow: {
      ring_label: "МКАД",
      tiers: [
        { weight_max_kg: 100, volume_max_m3: 1, city_fee: 3000, per_km: 50 },
        { weight_max_kg: 500, volume_max_m3: 5, city_fee: 5000, per_km: 80 },
      ],
    },
    kaliningrad: {
      ring_label: "КАД",
      tiers: [{ weight_max_kg: 100, volume_max_m3: 1, city_fee: 2500, per_km: 40 }],
    },
  },
};

describe("pickup customer quote matrix", () => {
  it("matches admin pickup tariff for moscow km", () => {
    const r = calcPickupFromMatrix(sampleMatrix, "moscow", 80, 0.2, 10);
    expect(r.total).toBe(3000 + 50 * 10);
  });
});
