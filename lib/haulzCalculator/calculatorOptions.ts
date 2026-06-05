import type { Pool } from "pg";
import {
  isExtraServiceEnabled,
  type CalculatorOptions,
  type Direction,
  type MainlineMode,
  type MainlineOption,
  type MainlinePayload,
} from "./types.js";
import { DEFAULT_MAINLINE_MIN_CHARGEABLE_WEIGHT_KG, mainlineBillableWeightKg } from "./chargeableWeight.js";
import { loadCalculatorTariffs } from "./tariffStore.js";

const MODE_LABELS: Record<MainlineMode, string> = {
  ferry: "Паром",
  auto: "Авто",
};

export function buildMainlineOptions(
  mainlines: MainlinePayload[],
  direction: Direction,
  chargeableWeightKg: number,
  mainlineMinChargeableWeightKg = DEFAULT_MAINLINE_MIN_CHARGEABLE_WEIGHT_KG,
): MainlineOption[] {
  const billableWeightKg = mainlineBillableWeightKg(chargeableWeightKg, mainlineMinChargeableWeightKg);
  return mainlines
    .filter((m) => m.direction === direction)
    .map((m) => ({
      mode: m.mode,
      label: MODE_LABELS[m.mode] || m.mode,
      pricePerKg: Number(m.price_per_kg) || 0,
      deliveryDays: Number(m.delivery_days) || 0,
      estimatedRub: Math.round((Number(m.price_per_kg) || 0) * billableWeightKg * 100) / 100,
      billableWeightKg,
      direction: m.direction,
    }));
}

export async function loadCalculatorOptions(
  pool: Pool,
  direction: Direction,
  chargeableWeightKg = 1,
): Promise<CalculatorOptions> {
  const tariffs = await loadCalculatorTariffs(pool);
  const factor = Number(tariffs.settings?.volumetric_factor_kg_m3) || 200;
  const mainlineMinChargeableWeightKg =
    Number(tariffs.settings?.mainline_min_chargeable_weight_kg) || DEFAULT_MAINLINE_MIN_CHARGEABLE_WEIGHT_KG;
  return {
    asOfDate: tariffs.asOfDate,
    direction,
    volumetricFactor: factor,
    mainlineMinChargeableWeightKg,
    mainlineOptions: buildMainlineOptions(
      tariffs.mainline,
      direction,
      chargeableWeightKg,
      mainlineMinChargeableWeightKg,
    ),
    extras: (tariffs.extras?.services ?? []).filter(isExtraServiceEnabled),
    pickupNote: tariffs.pickup?.note,
  };
}
