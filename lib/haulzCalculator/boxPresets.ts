import type { ParcelPlace } from "./types.js";

export const HAULZ_BOX_PRESET_LABELS = ["XS", "S", "M", "L", "XL"] as const;
export type HaulzBoxPresetLabel = (typeof HAULZ_BOX_PRESET_LABELS)[number];

export type BoxPreset = {
  label: HaulzBoxPresetLabel;
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

export function boxPresetToPlace(preset: BoxPreset, prev?: ParcelPlace): ParcelPlace {
  const boxRequired = prev?.boxRequired === true;
  return {
    weightKg: preset.weightKg,
    volumeM3: preset.volumeM3,
    lengthCm: preset.lengthCm,
    widthCm: preset.widthCm,
    heightCm: preset.heightCm,
    boxRequired,
    boxSize: boxRequired ? preset.label : prev?.boxSize,
  };
}

export function resolvePlaceBoxSize(place: ParcelPlace, fallbackPreset?: string): HaulzBoxPresetLabel {
  const explicit = String(place.boxSize || "")
    .trim()
    .toUpperCase();
  if (HAULZ_BOX_PRESET_LABELS.includes(explicit as HaulzBoxPresetLabel)) {
    return explicit as HaulzBoxPresetLabel;
  }
  const fallback = String(fallbackPreset || "")
    .trim()
    .toUpperCase();
  if (HAULZ_BOX_PRESET_LABELS.includes(fallback as HaulzBoxPresetLabel)) {
    return fallback as HaulzBoxPresetLabel;
  }
  for (const preset of HAULZ_BOX_PRESETS) {
    if (
      Number(place.lengthCm) === preset.lengthCm &&
      Number(place.widthCm) === preset.widthCm &&
      Number(place.heightCm) === preset.heightCm
    ) {
      return preset.label;
    }
  }
  return "M";
}
