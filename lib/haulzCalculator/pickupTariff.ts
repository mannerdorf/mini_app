import type { CityCode, PickupCityPayload, PickupMatrixPayload, PickupTier } from "./types.js";

export function resolveTierIndex(chargeableWeightKg: number, volumeM3: number, tiers: PickupTier[]): number {
  if (!tiers.length) return 0;
  let tierByWeight = tiers.length - 1;
  let tierByVolume = tiers.length - 1;
  const w = Number(chargeableWeightKg) || 0;
  const v = Number(volumeM3) || 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (w <= Number(t.weight_max_kg)) {
      tierByWeight = i;
      break;
    }
  }
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (v <= Number(t.volume_max_m3)) {
      tierByVolume = i;
      break;
    }
  }
  return Math.max(tierByWeight, tierByVolume);
}

export function calcPickupCityFee(
  city: PickupCityPayload | undefined,
  chargeableWeightKg: number,
  volumeM3: number,
  kmBeyondRing: number,
): { tierIndex: number; cityFee: number; perKmFee: number; perKmRate: number; total: number } {
  const tiers = city?.tiers ?? [];
  if (!tiers.length) {
    return { tierIndex: 0, cityFee: 0, perKmFee: 0, perKmRate: 0, total: 0 };
  }
  const tierIndex = resolveTierIndex(chargeableWeightKg, volumeM3, tiers);
  const tier = tiers[tierIndex];
  const cityFee = Number(tier.city_fee) || 0;
  const perKmRate = Number(tier.per_km) || 0;
  const km = Math.max(0, Number(kmBeyondRing) || 0);
  const perKmFee = perKmRate * km;
  return {
    tierIndex,
    cityFee,
    perKmFee,
    perKmRate,
    total: cityFee + perKmFee,
  };
}

export function calcPickupFromMatrix(
  payload: PickupMatrixPayload | null | undefined,
  cityCode: CityCode,
  chargeableWeightKg: number,
  volumeM3: number,
  kmBeyondRing: number,
) {
  const city = payload?.cities?.[cityCode];
  const r = calcPickupCityFee(city, chargeableWeightKg, volumeM3, kmBeyondRing);
  return { ...r, ringLabel: city?.ring_label };
}
