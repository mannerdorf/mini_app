import type { ChargeableSummary, ParcelPlace } from "./types.js";

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
