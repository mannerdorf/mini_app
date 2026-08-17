/**
 * Тип магистральной перевозки для грузов / дашборда / фильтров.
 * Правило распознавания «авиа» будет задано в isAir (cargoUtils).
 */
import type { CargoItem } from "../types";
import { isAir, isFerry } from "./cargoUtils";

export type CargoTransportType = "ferry" | "auto" | "air";

export const CARGO_TRANSPORT_TYPE_LABELS: Record<CargoTransportType, string> = {
  ferry: "Паром",
  auto: "Авто",
  air: "Авиа",
};

export const CARGO_TRANSPORT_TYPE_COLORS: Record<CargoTransportType, string> = {
  auto: "#06b6d4",
  ferry: "#f59e0b",
  air: "#6366f1",
};

export { isAir };

export function getCargoTransportType(
  item: Pick<CargoItem, "AK"> | Record<string, unknown> | null | undefined,
): CargoTransportType {
  if (isAir(item)) return "air";
  if (item && isFerry(item as CargoItem)) return "ferry";
  return "auto";
}

export function cargoTransportTypeLabel(type: CargoTransportType): string {
  return CARGO_TRANSPORT_TYPE_LABELS[type];
}
