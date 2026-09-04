import { isAir } from "./cargoUtils";

export function getSendingTransportType(vehicleText: string): "ferry" | "auto" | "air" | "" {
  const s = String(vehicleText ?? "")
    .toUpperCase()
    .trim();
  if (!s) return "";
  const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(s);
  return hasPlate ? "auto" : "ferry";
}

export function getSendingRowTransportMode(
  row: unknown,
  vehicleText: string,
): "ferry" | "auto" | "air" | "" {
  const r = row as Record<string, unknown> | null | undefined;
  if (isAir(r)) return "air";
  if (r?.AK === true || r?.AK === "true" || r?.AK === "1" || r?.AK === 1) return "ferry";
  return getSendingTransportType(vehicleText);
}
