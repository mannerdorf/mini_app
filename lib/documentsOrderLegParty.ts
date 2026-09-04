import type { DeliveryParty } from "./haulzCalculator/types.js";

export type DocumentsOrderPvzPartySource = {
  deliveryMode: "courier" | "point";
  addressKind: "pvz" | "custom";
  pvzItem?: {
    ВладелецИНН?: string;
    Наименование?: string;
    ОтправительПолучательНаименование?: string;
    КонтактноеЛицо?: string;
  } | null;
  addr?: { point?: { lat: number; lon: number } } | null;
  inn?: string;
  companyName?: string;
  phone?: string;
  contactName?: string;
};

/** Контрагент ноги заявки: ПВЗ из справочника или новый адрес. */
export function resolveDocumentsOrderLegParty(state: DocumentsOrderPvzPartySource): DeliveryParty {
  const party: DeliveryParty = { mode: state.deliveryMode };

  if (state.addressKind === "pvz" && state.pvzItem) {
    const inn = String(state.pvzItem.ВладелецИНН ?? "").replace(/\D/g, "").trim();
    if (inn) party.inn = inn;
    const companyName = String(
      state.pvzItem.Наименование ?? state.pvzItem.ОтправительПолучательНаименование ?? "",
    ).trim();
    if (companyName) party.companyName = companyName;
    const fullName = String(state.pvzItem.КонтактноеЛицо ?? state.contactName ?? "").trim();
    if (fullName) party.fullName = fullName;
    const phone = String(state.phone ?? "").trim();
    if (phone) party.phone = phone;
    return party;
  }

  if (state.addressKind === "custom" && state.addr?.point) {
    const inn = String(state.inn ?? "").replace(/\D/g, "").trim();
    if (inn) party.inn = inn;
    const companyName = String(state.companyName ?? "").trim();
    if (companyName) party.companyName = companyName;
    const phone = String(state.phone ?? "").trim();
    if (phone) party.phone = phone;
    const fullName = String(state.contactName ?? "").trim();
    if (fullName) party.fullName = fullName;
  }

  return party;
}
