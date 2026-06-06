export type OrderLegAddressKind = "pvz" | "custom" | "warehouse";

export const PVZ_CREATION_REQUIRED_NOTE = "Требуется создание ПВЗ";

/** Курьерский адрес, введённый вручную (не из справочника ПВЗ). */
export function legRequiresPvzCreation(
  partyMode: "courier" | "point",
  addressKind?: OrderLegAddressKind,
): boolean {
  return partyMode === "courier" && addressKind === "custom";
}
