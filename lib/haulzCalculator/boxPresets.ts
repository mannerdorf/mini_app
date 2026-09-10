import type { ParcelPlace } from "./types.js";

export type BoxPreset = {
  label: string;
  weightKg: number;
  volumeM3: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export const HAULZ_BOX_PRESETS: BoxPreset[] = [
  { label: "XS", weightKg: 1, volumeM3: 0.005, lengthCm: 20, widthCm: 15, heightCm: 17 },
  { label: "S", weightKg: 3, volumeM3: 0.02, lengthCm: 25, widthCm: 20, heightCm: 40 },
  { label: "M", weightKg: 10, volumeM3: 0.08, lengthCm: 40, widthCm: 40, heightCm: 50 },
  { label: "L", weightKg: 25, volumeM3: 0.2, lengthCm: 50, widthCm: 50, heightCm: 80 },
  { label: "XL", weightKg: 50, volumeM3: 0.5, lengthCm: 80, widthCm: 80, heightCm: 78 },
];

export function boxPresetToPlace(preset: BoxPreset): ParcelPlace {
  return {
    weightKg: preset.weightKg,
    volumeM3: preset.volumeM3,
    lengthCm: preset.lengthCm,
    widthCm: preset.widthCm,
    heightCm: preset.heightCm,
  };
}
