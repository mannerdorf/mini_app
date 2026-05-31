/** Heuristic: plate number pattern → auto, otherwise ferry. */
export function getSendingTransportType(vehicleText: string): "ferry" | "auto" | "" {
  const s = String(vehicleText ?? "")
    .toUpperCase()
    .trim();
  if (!s) return "";
  const hasPlate = /[A-ZА-Я][0-9]{3}[A-ZА-Я]{2}(?:\s*\/?\s*[0-9]{2,3})?/u.test(s);
  return hasPlate ? "auto" : "ferry";
}

/**
 * Transport mode for a sending row.
 * API `AK` flag takes priority over plate heuristic (trailer names must not become auto).
 */
export function getSendingRowTransportMode(
  row: unknown,
  vehicleText: string,
): "ferry" | "auto" | "" {
  const r = row as Record<string, unknown> | null | undefined;
  if (r?.AK === true || r?.AK === "true" || r?.AK === "1" || r?.AK === 1) return "ferry";
  return getSendingTransportType(vehicleText);
}
