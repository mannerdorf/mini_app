import type { AddressSelection, ParcelPlace } from "../../../lib/haulzCalculator/types";

export type HaulzCalcMobileRoute = "hub" | "from" | "to" | { place: number };

export function isPlaceRoute(route: HaulzCalcMobileRoute): route is { place: number } {
  return typeof route === "object" && route !== null && "place" in route;
}

export function addressModeLabel(mode: "courier" | "point", side: "from" | "to"): string {
  if (mode === "point") return side === "from" ? "Со склада" : "На складе";
  return side === "from" ? "Курьером" : "Курьером";
}

export function addressRowTitle(side: "from" | "to"): string {
  return side === "from" ? "Отправить" : "Вручить";
}

export function addressRowSubtitle(
  addr: AddressSelection | null,
  mode: "courier" | "point",
): string {
  if (!addr?.fullAddress) {
    return mode === "point" ? "Выберите склад" : "Укажите адрес";
  }
  return addr.fullAddress;
}

export function placePresetLabel(activePresetIdx: Record<number, string>, index: number): string {
  return activePresetIdx[index] ?? "—";
}

export function placeRowSubtitle(
  place: ParcelPlace,
  preset: string,
  chargeableKg?: number,
): string {
  const parts = [
    preset !== "—" ? `Размер ${preset}` : null,
    `${place.weightKg} кг`,
    `${place.volumeM3} м³`,
    chargeableKg != null && chargeableKg > 0 ? `платный вес ${Math.round(chargeableKg)} кг` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
