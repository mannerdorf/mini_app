import type { PvzItem } from "../../../api/client/documentsOrders";

function pvzSearchText(p: PvzItem): string {
  return [
    p.Наименование,
    p.ГородНаименование,
    p.РегионНаименование,
    p.ОтправительПолучательНаименование,
    p.КодДляПечати,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/ё/g, "е");
}

/** Склады HAULZ выбираются переключателем «Со склада», не из справочника ПВЗ. */
export function isExcludedDocumentsOrderPvz(p: PvzItem): boolean {
  const text = pvzSearchText(p);
  if (text.includes("андреевск")) return true;
  if (text.includes("железнодорожн") && /12/.test(text)) return true;
  return false;
}

export function filterDocumentsOrderPvzList(list: PvzItem[]): PvzItem[] {
  return list.filter((p) => !isExcludedDocumentsOrderPvz(p));
}
