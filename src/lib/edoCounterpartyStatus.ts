export const EDO_MY_COUNTERPARTY_STATUS = "IsMyCounteragent";

export function isEdoMyCounterpartyStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  if (!s) return false;
  return s === EDO_MY_COUNTERPARTY_STATUS || s.toLowerCase() === EDO_MY_COUNTERPARTY_STATUS.toLowerCase();
}

export function normalizeKontragentInn(inn: string | null | undefined): string {
  const raw = String(inn ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

export function innIsEdoPartner(edoPartnerInns: ReadonlySet<string> | undefined, inn: string | null | undefined): boolean {
  if (!edoPartnerInns?.size) return false;
  const normalized = normalizeKontragentInn(inn);
  return normalized.length > 0 && edoPartnerInns.has(normalized);
}
