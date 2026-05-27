/** Статус из GETALLKontragents: контрагент с которым работаем по ЭДО. */
export const EDO_MY_COUNTERPARTY_STATUS = "IsMyCounteragent";

export function isEdoMyCounterpartyStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  if (!s) return false;
  return s === EDO_MY_COUNTERPARTY_STATUS || s.toLowerCase() === EDO_MY_COUNTERPARTY_STATUS.toLowerCase();
}
