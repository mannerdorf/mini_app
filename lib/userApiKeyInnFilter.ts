/** Нормализация ИНН для сравнения в API-ключах и фильтрации строк. */
export function canonInnForApiKey(s: string): string {
  return String(s ?? "").replace(/\D/g, "").trim();
}

export function filterRowsByApiKeyInns<T>(rows: T[], keyAllowedInns: string[] | null | undefined, pickInn: (row: T) => string): T[] {
  if (!keyAllowedInns || keyAllowedInns.length === 0) return rows;
  const set = new Set(keyAllowedInns.map(canonInnForApiKey).filter(Boolean));
  if (set.size === 0) return rows;
  return rows.filter((row) => set.has(canonInnForApiKey(pickInn(row))));
}

/** Если в запросе указан ИНН — он должен входить в список ключа (при непустом списке). */
export function assertBodyInnAllowedForApiKey(bodyInn: unknown, keyAllowedInns: string[] | null | undefined): string | null {
  if (!keyAllowedInns || keyAllowedInns.length === 0) return null;
  const set = new Set(keyAllowedInns.map(canonInnForApiKey).filter(Boolean));
  if (set.size === 0) return null;
  const raw = String(bodyInn ?? "").trim();
  if (!raw) return null;
  if (!set.has(canonInnForApiKey(raw))) {
    return "ИНН не разрешён для этого API-ключа";
  }
  return null;
}
