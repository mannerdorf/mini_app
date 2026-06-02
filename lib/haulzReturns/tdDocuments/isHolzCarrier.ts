import type { HaulzCarrier } from "../carriers.js";

const HOLZ_INN = "9706037094";

export function normalizeCarrierName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHolzCarrier(carrier: Pick<HaulzCarrier, "name" | "inn"> | null | undefined): boolean {
  if (!carrier) return false;
  if (carrier.inn?.trim() === HOLZ_INN) return true;
  const n = normalizeCarrierName(carrier.name);
  return n.includes("холз") || n.includes("holz");
}
