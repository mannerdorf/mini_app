import type { Pool } from "pg";
import { computeChargeableWeight } from "../haulzCalculator/chargeableWeight.js";
import { kmBeyondRing } from "../haulzCalculator/mkadDistance.js";
import { calcPickupFromMatrix } from "../haulzCalculator/pickupTariff.js";
import { loadCalculatorTariffs } from "../haulzCalculator/tariffStore.js";
import type { CityCode } from "../haulzCalculator/types.js";

export type PickupCustomerQuoteInput = {
  city: CityCode;
  serviceKind?: "pickup" | "last_mile";
  asOfDate?: string;
  weightKg: number | null;
  volumeM3: number | null;
  latitude: number | null;
  longitude: number | null;
  kmOverride?: number | null;
  chargeableWeightKg?: number | null;
};

export type PickupCustomerQuoteResult = {
  asOfDate: string;
  tariffVersionId?: number;
  tariffEffectiveFrom?: string;
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
  if(input.asOfDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate) || !Number.isFinite(Date.parse(input.asOfDate)) || new Date(input.asOfDate).toISOString().slice(0,10)!==input.asOfDate)) throw new Error('Некорректная дата тарифа');
  const tariffs = await loadCalculatorTariffs(pool,input.asOfDate);
  const lastMile = input.serviceKind === "last_mile";
  const matrix = lastMile ? tariffs.byCode.last_mile_matrix?.version?.payload as typeof tariffs.pickup : tariffs.pickup;
  if (!matrix?.cities?.[input.city]?.tiers?.length) {
    throw new Error(
      `Тарифы ${lastMile ? "последней мили" : "забора"} не настроены${input.asOfDate ? ` на ${input.asOfDate}` : ""}. Загрузите матрицу в админке HAULZ → Калькулятор → ${lastMile ? "Последняя миля" : "Забор"}.`,
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
    matrix,
    input.city,
    chargeableWeightKg,
    volumeM3,
    km,
  );

  const ringName = input.city === "moscow" ? "МКАД" : "КАД";
  const totalRub = Math.round(calc.total);
  const summary = [
    `${lastMile ? "Доставка" : "Забор"} ${totalRub.toLocaleString("ru-RU")} ₽`,
    `${ringName} +${km.toFixed(1)} км`,
    `платный вес ${Math.round(chargeableWeightKg)} кг`,
    `тарифный диапазон ${calc.tierIndex + 1}`,
  ].join(" · ");

  return {
    asOfDate:tariffs.asOfDate,
    tariffVersionId:tariffs.byCode[lastMile ? "last_mile_matrix" : "pickup_matrix"]?.version?.id,
    tariffEffectiveFrom:tariffs.byCode[lastMile ? "last_mile_matrix" : "pickup_matrix"]?.version?.effective_from,
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
