const FIVEPOST_NAME_RE = /(?:^|[\s(«"'])5\s*[-–]?\s*(?:post|пост)\b|five\s*post|fivepost/i;
/** ИНН заказчика 5 POST (OMNI). Переопределяется через FIVEPOST_CUSTOMER_INNS. */
const DEFAULT_FIVEPOST_CUSTOMER_INNS = "7722461620";

function normalizeInn(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function parseInnAllowlist(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of String(raw ?? "").split(/[,;\s]+/)) {
    const inn = normalizeInn(part);
    if (inn.length >= 10) set.add(inn);
  }
  return set;
}

function fivepostInnAllowlist(): Set<string> {
  const raw = String(process.env.FIVEPOST_CUSTOMER_INNS ?? "").trim() || DEFAULT_FIVEPOST_CUSTOMER_INNS;
  return parseInnAllowlist(raw);
}

export function isFivepostCustomerName(customerName: unknown): boolean {
  const name = String(customerName ?? "").trim();
  if (!name) return false;
  return FIVEPOST_NAME_RE.test(name);
}

export function isFivepostCustomerInn(inn: unknown): boolean {
  const normalized = normalizeInn(inn);
  if (!normalized) return false;
  const allowlist = fivepostInnAllowlist();
  return allowlist.size > 0 && allowlist.has(normalized);
}

/** Заказчик 5 POST: явный ИНН в FIVEPOST_CUSTOMER_INNS или название с «5 POST». */
export function isFivepostCustomer(inn: unknown, customerName?: unknown): boolean {
  return isFivepostCustomerInn(inn) || isFivepostCustomerName(customerName);
}
