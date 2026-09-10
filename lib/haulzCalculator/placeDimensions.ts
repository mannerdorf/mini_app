import type { ParcelPlace } from "./types.js";

/** Объём м³ из габаритов в см. */
export function volumeM3FromCm(lengthCm: number, widthCm: number, heightCm: number): number {
  const l = Number(lengthCm) || 0;
  const w = Number(widthCm) || 0;
  const h = Number(heightCm) || 0;
  if (l <= 0 || w <= 0 || h <= 0) return 0;
  return (l * w * h) / 1_000_000;
}

/** Куб с заданным объёмом (см). */
export function cubeSideCmFromVolumeM3(volumeM3: number): number {
  const v = Number(volumeM3) || 0;
  if (v <= 0) return 0;
  return Math.cbrt(v * 1_000_000);
}

export function hasPlaceDimensions(p: ParcelPlace): boolean {
  return (Number(p.lengthCm) || 0) > 0 && (Number(p.widthCm) || 0) > 0 && (Number(p.heightCm) || 0) > 0;
}

/** Нормализует место: при наличии Д×Ш×В пересчитывает объём, иначе — куб из объёма. */
export function normalizeParcelPlace(p: ParcelPlace): ParcelPlace {
  const weightKg = Math.max(0, Number(p.weightKg) || 0);
  if (hasPlaceDimensions(p)) {
    const lengthCm = Math.max(0, Number(p.lengthCm) || 0);
    const widthCm = Math.max(0, Number(p.widthCm) || 0);
    const heightCm = Math.max(0, Number(p.heightCm) || 0);
    return {
      ...p,
      weightKg,
      lengthCm,
      widthCm,
      heightCm,
      volumeM3: volumeM3FromCm(lengthCm, widthCm, heightCm),
    };
  }
  const volumeM3 = Math.max(0, Number(p.volumeM3) || 0);
  const side = cubeSideCmFromVolumeM3(volumeM3);
  const rounded = side > 0 ? Math.max(1, Math.round(side)) : 0;
  return {
    ...p,
    weightKg,
    volumeM3,
    lengthCm: rounded || undefined,
    widthCm: rounded || undefined,
    heightCm: rounded || undefined,
  };
}

export function normalizeParcelPlaces(places: ParcelPlace[]): ParcelPlace[] {
  return places.map(normalizeParcelPlace);
}
