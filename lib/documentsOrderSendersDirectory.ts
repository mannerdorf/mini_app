import type { PvzItem } from "../src/api/client/documentsOrders.js";

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

/** Уникальные отправители: активный заказчик + Владелец / ОтправительПолучатель из справочника ПВЗ. */
export function buildDocumentsOrderSendersDirectory(
  pvzList: PvzItem[],
  fallback?: { inn?: string | null; name?: string | null },
): DocumentsOrderSenderOption[] {
  const map = new Map<string, DocumentsOrderSenderOption>();

  const add = (innRaw: unknown, nameRaw: unknown) => {
    const inn = normalizeInn(innRaw);
    const name = normalizeName(nameRaw);
    if (!inn && !name) return;
    const key = senderKey(inn, name || inn);
    if (map.has(key)) return;
    map.set(key, { key, inn, name: name || inn });
  };

  if (fallback) {
    add(fallback.inn, fallback.name);
  }

  for (const p of pvzList) {
    const inn = p.ВладелецИНН;
    const name =
      normalizeName(p.ОтправительПолучательНаименование) ||
      normalizeName(p.ВладелецНаименование) ||
      normalizeName(p.Наименование);
    add(inn, name);
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function pickDefaultDocumentsOrderSender(
  options: DocumentsOrderSenderOption[],
  preferredInn?: string | null,
  preferredName?: string | null,
): DocumentsOrderSenderOption | null {
  if (options.length === 0) return null;
  const inn = normalizeInn(preferredInn);
  const name = normalizeName(preferredName);
  if (inn && name) {
    const exact = options.find((o) => o.inn === inn && o.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact;
  }
  if (inn) {
    const byInn = options.find((o) => o.inn === inn);
    if (byInn) return byInn;
  }
  return options[0] ?? null;
}
