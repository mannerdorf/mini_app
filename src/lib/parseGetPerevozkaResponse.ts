import type { CargoItem, PerevozkiRole } from "../types";
import { hasPerevozkaCargoFields } from "./perevozkaNumber";

function pickCargoRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const top = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!top || typeof top !== "object" || top.error) return null;
  if (hasPerevozkaCargoFields(top)) return top;
  for (const nest of ["Response", "Data", "Result", "result", "data"]) {
    const nested = top[nest];
    if (nested && typeof nested === "object" && !Array.isArray(nested) && hasPerevozkaCargoFields(nested as Record<string, unknown>)) {
      return nested as Record<string, unknown>;
    }
  }
  return null;
}

export function buildCargoItemFromGetPerevozkaResponse(data: unknown, displayNumber: string): CargoItem | null {
  const raw = pickCargoRecord(data);
  if (!raw) return null;

  const statuses = raw.Statuses ?? raw.statuses;
  const lastStatus = Array.isArray(statuses) && statuses.length > 0 ? (statuses[statuses.length - 1] as Record<string, unknown>) : null;
  const stateFromStatuses = lastStatus?.Status ?? lastStatus?.status ?? null;

  return {
    ...(raw as CargoItem),
    Number: String(raw.Number ?? raw.number ?? raw.Номер ?? displayNumber),
    DatePrih: (raw.DatePrih ?? raw.datePrih) as CargoItem["DatePrih"],
    DateVr: (raw.DateVr ?? raw.dateVr) as CargoItem["DateVr"],
    State: String(raw.State ?? raw.state ?? stateFromStatuses ?? ""),
    Mest: raw.Mest ?? raw.mest,
    PW: raw.PW ?? raw.pw,
    W: raw.W ?? raw.w,
    Value: raw.Value ?? raw.value,
    Sum: raw.Sum ?? raw.sum,
    StateBill: raw.StateBill ?? raw.stateBill,
    Sender: raw.Sender ?? raw.sender,
    Customer: raw.Customer ?? raw.customer,
    Receiver: raw.Receiver ?? raw.receiver,
    _role: ((raw._role as PerevozkiRole | undefined) ?? "Customer") as PerevozkiRole,
  };
}

export function normalizePrefetchedCargoItem(raw: CargoItem, displayNumber: string): CargoItem {
  return {
    ...raw,
    Number: String(raw.Number ?? (raw as Record<string, unknown>).number ?? displayNumber),
    _role: raw._role ?? ("Customer" as PerevozkiRole),
  };
}
