import {
  normalizePlaceKey,
  extractPlaceNumberFromLabel,
  extractPerevozkaNomenclatureRows,
  pickFirstNumericField,
} from "./claimDamageCalc";
import { fetchPerevozkaByNumber } from "../../../api/client/perevozkiClient";

export async function fetchAdminClaimMaxDamageAmount(
  cargoNumber: string,
  selectedPlacesRaw: unknown[],
): Promise<number | null> {
  const selectedPlaceKeys = selectedPlacesRaw
    .map((value) => normalizePlaceKey(extractPlaceNumberFromLabel(value)))
    .filter(Boolean);

  if (!cargoNumber || selectedPlaceKeys.length === 0) return 0;

  const data = await fetchPerevozkaByNumber(cargoNumber);

  const rows = extractPerevozkaNomenclatureRows(data);
  const selectedSet = new Set(selectedPlaceKeys);
  const rootTariff = pickFirstNumericField(data, ["Tariff", "tariff", "Rate", "rate", "Тариф", "Ставка"]);
  let selectedCostSum = 0;
  let selectedPaidWeightSum = 0;
  let matchedTariff = rootTariff;

  rows.forEach((row: Record<string, unknown>) => {
    const placeRaw = row?.Package
      ?? row?.package
      ?? row?.Barcode
      ?? row?.barcode
      ?? row?.Штрихкод
      ?? row?.НомерМеста
      ?? row?.PlaceNumber;
    const placeKey = normalizePlaceKey(placeRaw);
    if (!placeKey || !selectedSet.has(placeKey)) return;
    const placeCost = pickFirstNumericField(row, [
      "DeclaredCost", "declaredCost", "DeclaredValue", "declaredValue",
      "ОбъявленнаяСтоимость", "ОбъявлСтоимость", "Стоимость", "Cost", "Price",
    ]);
    const paidWeight = pickFirstNumericField(row, [
      "PaidWeight", "paidWeight", "ChargeableWeight", "chargeableWeight",
      "ПлатныйВес", "ВесПлатный", "WeightPaid", "weightPaid",
    ]);
    const rowTariff = pickFirstNumericField(row, ["Tariff", "tariff", "Rate", "rate", "Тариф", "Ставка"]);
    if (rowTariff > 0) matchedTariff = rowTariff;
    selectedCostSum += placeCost;
    selectedPaidWeightSum += paidWeight;
  });

  const total = selectedCostSum + selectedPaidWeightSum * matchedTariff;
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}
