import type { CityCode } from "../../../../lib/haulzCalculator/types";
import type { PvzItem } from "../../../api/client/documentsOrders";

function normalizeInn(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

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

/** Только пункты владельца — ИНН заказчика из шапки. */
export function filterDocumentsOrderPvzByOwnerInn(list: PvzItem[], customerInn: string | null | undefined): PvzItem[] {
  const inn = normalizeInn(customerInn);
  if (!inn) return [];
  return filterDocumentsOrderPvzList(list).filter((p) => normalizeInn(p.ВладелецИНН) === inn);
}

export function inferPvzCityCode(p: PvzItem, fallback?: CityCode): CityCode | null {
  const text = pvzSearchText(p);
  if (text.includes("калининград")) return "kaliningrad";
  if (text.includes("москва") || text.includes("московск")) return "moscow";
  return fallback ?? null;
}

/** ПВЗ справочника для стороны маршрута: отправка — город отправления, выдача — город назначения. */
export function filterDocumentsOrderPvzByCity(
  list: PvzItem[],
  city: CityCode,
  customerInn?: string | null,
): PvzItem[] {
  const scoped =
    customerInn === undefined
      ? filterDocumentsOrderPvzList(list)
      : filterDocumentsOrderPvzByOwnerInn(list, customerInn);
  return scoped.filter((p) => inferPvzCityCode(p, city) === city);
}
