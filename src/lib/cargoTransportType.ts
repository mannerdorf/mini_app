/**
 * Тип магистральной перевозки для грузов / дашборда / фильтров.
 * Правило распознавания «авиа» будет задано отдельно — пока isAir всегда false.
 */
import type { CargoItem } from "../types";
import { isFerry } from "./cargoUtils";

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

/**
 * Определение авиа-перевозки.
 * TODO: подключить правило от продукта (поле 1С / эвристика) — пока всегда false.
 */
export function isAir(_item: Pick<CargoItem, "AK"> | Record<string, unknown> | null | undefined): boolean {
  return false;
}

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
