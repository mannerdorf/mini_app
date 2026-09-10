import { normalizeParcelPlaces } from "./placeDimensions.js";
import type { ParcelPlace } from "./types.js";

function readCm(o: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = Number(o[key]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

export function parseParcelPlaces(raw: unknown): ParcelPlace[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return normalizeParcelPlaces([{ weightKg: 1, volumeM3: 0.01 }]);
  }
  const places = raw.map((p) => {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    const lengthCm = readCm(o, "lengthCm", "length_cm", "lCm", "l_cm");
    const widthCm = readCm(o, "widthCm", "width_cm", "wCm", "w_cm");
    const heightCm = readCm(o, "heightCm", "height_cm", "hCm", "h_cm");
    const boxRequired = o.boxRequired === true || o.box_required === true;
    const boxSizeRaw = String(o.boxSize ?? o.box_size ?? "").trim();
    return {
      weightKg: Math.max(0, Number(o.weightKg ?? o.weight_kg) || 0),
      volumeM3: Math.max(0, Number(o.volumeM3 ?? o.volume_m3) || 0),
      lengthCm,
      widthCm,
      heightCm,
      boxRequired: boxRequired || undefined,
      boxSize: boxSizeRaw || undefined,
    };
  });
  return normalizeParcelPlaces(places);
}
