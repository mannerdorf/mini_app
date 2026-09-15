export type DocumentsOrderSupplierRow = {
  inn: string;
  supplier_name: string;
  email?: string;
};

export type DocumentsOrderSenderOption = {
  key: string;
  inn: string;
  name: string;
};

function normalizeInn(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function normalizeName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function senderKey(inn: string, name: string): string {
  return `${inn}|${name.toLowerCase().replace(/ё/g, "е")}`;
}

/** Уникальные отправители из справочника поставщиков (`cache_suppliers` / GETALLKontragents). */
export function buildDocumentsOrderSendersDirectory(
  suppliers: DocumentsOrderSupplierRow[],
): DocumentsOrderSenderOption[] {
  const map = new Map<string, DocumentsOrderSenderOption>();

  for (const row of suppliers) {
    const inn = normalizeInn(row.inn);
    const name = normalizeName(row.supplier_name);
    if (!inn && !name) continue;
    const key = senderKey(inn, name || inn);
    if (map.has(key)) continue;
    map.set(key, { key, inn, name: name || inn });
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function filterDocumentsOrderSenderOptions(
  options: DocumentsOrderSenderOption[],
  query: string,
): DocumentsOrderSenderOption[] {
  const q = query.trim().toLowerCase().replace(/ё/g, "е");
  if (!q) return options;
  return options.filter((o) => {
    const hay = `${o.name} ${o.inn}`.toLowerCase().replace(/ё/g, "е");
    return hay.includes(q);
  });
}

export function findDocumentsOrderSenderOption(
  options: DocumentsOrderSenderOption[],
  inn?: string | null,
  name?: string | null,
): DocumentsOrderSenderOption | null {
  const nInn = normalizeInn(inn);
  const nName = normalizeName(name);
  if (!nInn && !nName) return null;
  if (nInn && nName) {
    const exact = options.find((o) => o.inn === nInn && o.name.toLowerCase() === nName.toLowerCase());
    if (exact) return exact;
  }
  if (nInn) {
    const byInn = options.find((o) => o.inn === nInn);
    if (byInn) return byInn;
  }
  return null;
}
