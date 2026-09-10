import type { RigidPackagingPayload } from "./types.js";

export const DEFAULT_RIGID_PACKAGING_MAX_HEIGHT_M = 1.8;

export const DEFAULT_RIGID_PACKAGING: RigidPackagingPayload = {
  max_height_m: DEFAULT_RIGID_PACKAGING_MAX_HEIGHT_M,
  pallet_types: [
    {
      code: "1200x1000",
      label: "1200×1000",
      length_mm: 1200,
      width_mm: 1000,
      price_per_meter_rub: 2000,
      pallet_price_rub: 350,
    },
    {
      code: "1200x800",
      label: "1200×800",
      length_mm: 1200,
      width_mm: 800,
      price_per_meter_rub: 1700,
      pallet_price_rub: 250,
    },
    {
      code: "800x600",
      label: "800×600",
      length_mm: 800,
      width_mm: 600,
      price_per_meter_rub: 1000,
      pallet_price_rub: 200,
    },
    {
      code: "600x400",
      label: "600×400",
      length_mm: 600,
      width_mm: 400,
      price_per_meter_rub: 900,
      pallet_price_rub: 200,
    },
  ],
};
