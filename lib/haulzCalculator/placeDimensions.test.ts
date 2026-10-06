import { describe, expect, it } from "vitest";
import { parseParcelPlaces } from "./parsePlaces";
import { normalizeParcelPlace, updatePlaceDimension } from "./placeDimensions";
import { summarizePlaces } from "./chargeableWeight";
import { boxPresetToPlace, HAULZ_BOX_PRESETS } from "./boxPresets";
import type { ParcelPlace } from "./types";

const manual: ParcelPlace = { weightKg: 50, lengthCm: 80, widthCm: 80, heightCm: 78, volumeM3: 0.7, volumeMode: "manual" };
describe("manual parcel volume", () => {
  it("survives draft JSON, API parsing and repeated normalization and determines billable weight", () => {
    const places = parseParcelPlaces(JSON.parse(JSON.stringify([manual])));
    expect(normalizeParcelPlace(normalizeParcelPlace(places[0]))).toEqual(manual);
    expect(summarizePlaces(places)).toMatchObject({ volumeM3: 0.7, chargeableWeightKg: 140 });
  });
  it("preserves exact volume without dimensions after packaging dimension inference", () => {
    const places = parseParcelPlaces([{ weightKg: 1, volumeM3: 0.123, volumeMode: "manual" }]);
    expect(summarizePlaces(places).volumeM3).toBe(0.123);
  });
  it("keeps legacy automatic dimension calculation", () => {
    expect(parseParcelPlaces([{ ...manual, volumeMode: undefined }])[0].volumeM3).toBeCloseTo(0.4992);
  });
  it("returns to automatic volume when dimensions or preset change", () => {
    const changed = updatePlaceDimension(manual, "heightCm", 100);
    expect(changed.volumeMode).toBeUndefined();
    expect(summarizePlaces([changed]).volumeM3).toBe(0.64);
    const preset = boxPresetToPlace(HAULZ_BOX_PRESETS[2], manual);
    expect(preset.volumeMode).toBeUndefined();
    expect(summarizePlaces([preset]).volumeM3).toBe(0.08);
  });
  it("sums manual and automatic places independently", () => {
    expect(summarizePlaces([manual, boxPresetToPlace(HAULZ_BOX_PRESETS[2])]).volumeM3).toBeCloseTo(0.78);
  });
});
