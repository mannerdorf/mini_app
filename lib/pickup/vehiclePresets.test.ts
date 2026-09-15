import { describe, expect, it } from "vitest";
import {
  isVehiclePresetValue,
  VEHICLE_MODEL_PRESETS,
} from "./vehiclePresets";

describe("vehiclePresets", () => {
  it("detects preset values", () => {
    expect(isVehiclePresetValue(VEHICLE_MODEL_PRESETS, "ГАЗель Next")).toBe(true);
    expect(isVehiclePresetValue(VEHICLE_MODEL_PRESETS, "Уникальный фургон")).toBe(
      false,
    );
  });
});
