/** Фильтрация заявок по заказчику (ИНН / наименование из шапки). */

export function normalizeOrderInn(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

export function normalizeCompanyName(value: unknown): string {
  return String(value ?? "")
    .replace(/^((ооо|оао|зао|пао|ип|ao|llc)\s+)|(\s+(ооо|оао|зао|пао|ип|ao|llc))$/gi, "")
    .replace(/["«»]/g, "")
    .trim()
    .toLowerCase();
}

export function getOrderCustomerInn(item: Record<string, unknown> | null | undefined): string {
  if (!item) return "";
  return normalizeOrderInn(
    item.ЗаказчикИНН ??
      item.CustomerINN ??
      item.CustomerInn ??
      item.customerInn ??
      item.INNCustomer ??
      item.InnCustomer ??
      item.КонтрагентИНН ??
      item.INN ??
      item.Inn ??
      item.inn,
  );
}

export function getOrderSenderInn(item: Record<string, unknown> | null | undefined): string {
  if (!item) return "";
  return normalizeOrderInn(
    item.ОтправительИНН ??
      item.SenderINN ??
      item.SenderInn ??
      item.INNSender ??
      item.InnSender,
  );
}

export function getOrderCustomerName(item: Record<string, unknown> | null | undefined): string {
  if (!item) return "";
  return String(
    item.ЗаказчикНаименование ??
      item.Заказчик ??
      item.Customer ??
      item.customer ??
      item.Контрагент ??
      item.Contractor ??
      item.Organization ??
      item.ПлательщикНаименование ??
      item.PayerName ??
      "",
  ).trim();
}

export function getOrderSenderName(item: Record<string, unknown> | null | undefined): string {
  if (!item) return "";
  return String(
    item.ОтправительНаименование ??
      item.Отправитель ??
      item.ГрузоотправительНаименование ??
      item.Грузоотправитель ??
      item.Sender ??
      item.sender ??
      item.Shipper ??
      item.Consignor ??
      "",
  ).trim();
}

export type OrderCustomerScope = {
  inn?: string;
  name?: string;
};

/** Контрагент видит только свои заявки: по ИНН заказчика/отправителя или по наименованию отправителя. */
export function orderMatchesCustomerScope(
  item: Record<string, unknown> | null | undefined,
  scope: OrderCustomerScope,
): boolean {
  if (!item) return false;
  const scopeInn = normalizeOrderInn(scope.inn);
  const scopeName = normalizeCompanyName(scope.name);

  if (scopeInn) {
    const customerInn = getOrderCustomerInn(item);
    const senderInn = getOrderSenderInn(item);
    if (customerInn === scopeInn || senderInn === scopeInn) return true;
  }

  if (scopeName) {
    const senderName = normalizeCompanyName(getOrderSenderName(item));
    const customerName = normalizeCompanyName(getOrderCustomerName(item));
    if (senderName && senderName === scopeName) return true;
    if (customerName && customerName === scopeName) return true;
  }

  return !scopeInn && !scopeName;
}

export function getOrderStatusLabel(item: Record<string, unknown> | null | undefined): string {
  if (!item) return "—";
  if (item._pendingOrder === true) return "Ожидает обработки";
  const raw = String(
    item.Статус ??
      item.State ??
      item.state ??
      item.Status ??
      item.status ??
      item.Состояние ??
      "",
  ).trim();
  if (raw) return raw;
  const comment = String(item.Комментарий ?? item.Comment ?? "").trim();
  if (comment.includes("Ожидает обработки")) return "Ожидает обработки";
  return "—";
}
