import type { ChargeableSummary, ParcelPlace } from "./types.js";

/** Минимальный платный вес для расчёта магистрали, если в настройках не задано иное. */
export const DEFAULT_MAINLINE_MIN_CHARGEABLE_WEIGHT_KG = 20;

export function mainlineBillableWeightKg(
  chargeableWeightKg: number,
  minKg = DEFAULT_MAINLINE_MIN_CHARGEABLE_WEIGHT_KG,
): number {
  const weight = Number(chargeableWeightKg) || 0;
  const min = Number(minKg) || 0;
  if (min <= 0) return weight;
  return Math.max(weight, min);
}

export function computeVolumeWeightKg(volumeM3: number, factorKgM3 = 200): number {
  const v = Number(volumeM3);
  const f = Number(factorKgM3);
  if (!Number.isFinite(v) || v < 0 || !Number.isFinite(f) || f <= 0) return 0;
  return v * f;
}

export function computeChargeableWeight(actualKg: number, volumeM3: number, factorKgM3 = 200): number {
  const actual = Number(actualKg);
  const volW = computeVolumeWeightKg(volumeM3, factorKgM3);
  const a = Number.isFinite(actual) && actual > 0 ? actual : 0;
  return Math.max(a, volW);
}

export function summarizePlaces(places: ParcelPlace[], factorKgM3 = 200): ChargeableSummary {
  let actualWeightKg = 0;
  let volumeM3 = 0;
  for (const p of places) {
    actualWeightKg += Number(p.weightKg) || 0;
    volumeM3 += Number(p.volumeM3) || 0;
  }
  const volumeWeightKg = computeVolumeWeightKg(volumeM3, factorKgM3);
  const chargeableWeightKg = Math.max(actualWeightKg, volumeWeightKg);
  return {
    actualWeightKg,
    volumeM3,
    volumeWeightKg,
    chargeableWeightKg,
    volumetricFactor: factorKgM3,
  };
}
