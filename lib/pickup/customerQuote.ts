import type { Pool } from "pg";
import { computeChargeableWeight } from "../haulzCalculator/chargeableWeight.js";
import { kmBeyondRing } from "../haulzCalculator/mkadDistance.js";
import { calcPickupFromMatrix } from "../haulzCalculator/pickupTariff.js";
import { loadCalculatorTariffs } from "../haulzCalculator/tariffStore.js";
import type { CityCode } from "../haulzCalculator/types.js";

export type PickupCustomerQuoteInput = {
  city: CityCode;
  weightKg: number | null;
  volumeM3: number | null;
  latitude: number | null;
  longitude: number | null;
  kmOverride?: number | null;
  chargeableWeightKg?: number | null;
};

export type PickupCustomerQuoteResult = {
  totalRub: number;
  km: number;
  chargeableWeightKg: number;
  actualWeightKg: number;
  volumeM3: number;
  tierIndex: number;
  cityFee: number;
  perKmFee: number;
  perKmRate: number;
  ringLabel?: string;
  summary: string;
};

export async function buildPickupCustomerQuote(
  pool: Pool,
  input: PickupCustomerQuoteInput,
): Promise<PickupCustomerQuoteResult> {
  const tariffs = await loadCalculatorTariffs(pool);
  if (!tariffs.pickup?.cities?.[input.city]?.tiers?.length) {
    throw new Error(
      "Тарифы забора не настроены. Загрузите матрицу в админке HAULZ → Калькулятор → Забор.",
    );
  }

  const factor = Number(tariffs.settings?.volumetric_factor_kg_m3) || 200;
  const actualWeightKg = Number(input.weightKg) || 0;
  const volumeM3 = Number(input.volumeM3) || 0;
  const chargeableWeightKg = input.chargeableWeightKg ?? computeChargeableWeight(actualWeightKg, volumeM3, factor);
  if (!Number.isFinite(chargeableWeightKg) || chargeableWeightKg < 0) throw new Error("Некорректный платный вес");

  if (chargeableWeightKg <= 0 && volumeM3 <= 0) {
    throw new Error("Укажите вес или объём груза для расчёта забора.");
  }

  let km = input.kmOverride;
  if (km == null || !Number.isFinite(km)) {
    const lat = input.latitude;
    const lon = input.longitude;
    if (lat == null || lon == null) {
      throw new Error(
        "Укажите адрес с координатами (ПВЗ или новый адрес с подтверждением на карте) либо километры от кольца вручную.",
      );
    }
    const ring = await kmBeyondRing(pool, input.city, { lat, lon }, undefined, "max");
    km = ring.km;
  }
  km = Math.max(0, Number(km) || 0);

  const calc = calcPickupFromMatrix(
    tariffs.pickup,
    input.city,
    chargeableWeightKg,
    volumeM3,
    km,
  );

  const ringName = input.city === "moscow" ? "МКАД" : "КАД";
  const totalRub = Math.round(calc.total * 100) / 100;
  const summary = [
    `Забор ${totalRub.toLocaleString("ru-RU")} ₽`,
    `${ringName} +${km.toFixed(1)} км`,
    `платный вес ${Math.round(chargeableWeightKg)} кг`,
    `тарифный диапазон ${calc.tierIndex + 1}`,
  ].join(" · ");

  return {
    totalRub,
    km,
    chargeableWeightKg,
    actualWeightKg,
    volumeM3,
    tierIndex: calc.tierIndex,
    cityFee: calc.cityFee,
    perKmFee: calc.perKmFee,
    perKmRate: calc.perKmRate,
    ringLabel: calc.ringLabel ?? ringName,
    summary,
  };
}
