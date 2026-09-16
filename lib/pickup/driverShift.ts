import { validTime } from "./model.js";

/** Смена водителя задаётся в справочнике; без неё не ограничиваем маршрут. */
export function driverHasWorkShift(data: Record<string, string>): boolean {
  return (
    validTime(data.from) && validTime(data.to) && data.from < data.to
  );
}

export function driverShiftStart(data: Record<string, string>): string {
  return driverHasWorkShift(data) ? data.from : "00:00";
}

export function driverShiftEnd(data: Record<string, string>): string {
  return driverHasWorkShift(data) ? data.to : "23:59";
}
