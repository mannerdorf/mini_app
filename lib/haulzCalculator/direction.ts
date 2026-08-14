import type { CityCode, Direction } from "./types.js";

export function citiesForDirection(direction: Direction): { from: CityCode; to: CityCode } {
  return direction === "kgd_mow"
    ? { from: "kaliningrad", to: "moscow" }
    : { from: "moscow", to: "kaliningrad" };
}

export function cityLabel(city: CityCode): string {
  return city === "moscow" ? "Москва" : "Калининград";
}
