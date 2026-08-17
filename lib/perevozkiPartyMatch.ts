/** Сопоставление перевозок с ИНН/именем контрагента по ролям заказчик/отправитель/получатель. */

import { normalizeCompanyName, normalizeOrderInn } from "./orderCustomerScope.js";

export type PerevozkiPartyRole = "Customer" | "Sender" | "Receiver";

function firstInn(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeOrderInn(item[key]);
    if (value) return value;
  }
  return "";
}

export function perevozkiCustomerInn(item: Record<string, unknown>): string {
  return firstInn(item, [
    "INN",
    "Inn",
    "inn",
    "CustomerINN",
    "CustomerInn",
    "customerInn",
    "INNCustomer",
    "InnCustomer",
    "ЗаказчикИНН",
  ]);
}

export function perevozkiSenderInn(item: Record<string, unknown>): string {
  return firstInn(item, [
    "SenderINN",
    "senderINN",
    "SenderInn",
    "senderInn",
    "INNSender",
    "InnSender",
    "ОтправительИНН",
    "ИННОтправителя",
    "ИННОтправитель",
    "INN_SENDER",
  ]);
}

export function perevozkiReceiverInn(item: Record<string, unknown>): string {
  return firstInn(item, [
    "ReceiverINN",
    "receiverINN",
    "ReceiverInn",
    "receiverInn",
    "INNReceiver",
    "InnReceiver",
    "ПолучательИНН",
    "ИННПолучателя",
    "ИННПолучатель",
    "INN_RECEIVER",
  ]);
}

export function perevozkiCustomerName(item: Record<string, unknown>): string {
  return String(item.Customer ?? item.customer ?? "").trim();
}

export function perevozkiSenderName(item: Record<string, unknown>): string {
  return String(item.Sender ?? item.sender ?? "").trim();
}

export function perevozkiReceiverName(item: Record<string, unknown>): string {
  return String(item.Receiver ?? item.receiver ?? "").trim();
}

export function resolvePerevozkiRolesForInns(
  item: Record<string, unknown>,
  inns: Set<string>,
  nameNorms?: Set<string>,
): PerevozkiPartyRole[] {
  const roles: PerevozkiPartyRole[] = [];
  const customerInn = perevozkiCustomerInn(item);
  const senderInn = perevozkiSenderInn(item);
  const receiverInn = perevozkiReceiverInn(item);
  if (customerInn && inns.has(customerInn)) roles.push("Customer");
  if (senderInn && inns.has(senderInn)) roles.push("Sender");
  if (receiverInn && inns.has(receiverInn)) roles.push("Receiver");

  if (nameNorms && nameNorms.size > 0) {
    const customerName = normalizeCompanyName(perevozkiCustomerName(item));
    const senderName = normalizeCompanyName(perevozkiSenderName(item));
    const receiverName = normalizeCompanyName(perevozkiReceiverName(item));
    if (!roles.includes("Customer") && customerName && nameNorms.has(customerName)) roles.push("Customer");
    if (!roles.includes("Sender") && senderName && nameNorms.has(senderName)) roles.push("Sender");
    if (!roles.includes("Receiver") && receiverName && nameNorms.has(receiverName)) roles.push("Receiver");
  }
  return roles;
}

const FINANCE_KEYS = [
  "Sum",
  "sum",
  "Sum_paid",
  "SumPaid",
  "sum_paid",
  "sumPaid",
  "StateBill",
  "stateBill",
  "BillNum",
  "Bill_Number",
  "billnum",
  "bill_number",
  "UPD",
  "upd",
] as const;

/** Убрать финансовые поля для ролей отправитель/получатель. */
export function stripPerevozkiFinances<T extends Record<string, unknown>>(item: T): T {
  const out: Record<string, unknown> = { ...item };
  for (const key of FINANCE_KEYS) {
    if (key in out) delete out[key];
  }
  return out as T;
}

export function annotatePerevozkiRoles<T extends Record<string, unknown>>(
  item: T,
  roles: PerevozkiPartyRole[],
): T {
  if (!roles.length) return item;
  const displayRole = roles.includes("Customer")
    ? "Customer"
    : roles.includes("Sender")
      ? "Sender"
      : "Receiver";
  const withRoles = {
    ...item,
    _roles: roles,
    _role: displayRole,
  } as T;
  if (!roles.includes("Customer")) return stripPerevozkiFinances(withRoles as Record<string, unknown>) as T;
  return withRoles;
}
