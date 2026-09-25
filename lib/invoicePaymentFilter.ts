/** Как в src/lib/statusUtils.ts — фильтр оплаты счёта для документов. */

import { invoicePaymentStatusForUi } from "../src/lib/formatUtils.js";

export type PaymentFilterKey = "unpaid" | "cancelled" | "paid" | "partial" | "unknown";

export type InvoicePaymentFinance = { sum: number; paid: number; balance: number };

export function getPaymentFilterKey(stateBill: string | undefined): PaymentFilterKey {
  if (!stateBill) return "unknown";
  const lower = stateBill.toLowerCase().trim();
  if (
    lower.includes("не оплачен") ||
    lower.includes("неоплачен") ||
    lower.includes("не оплачён") ||
    lower.includes("неоплачён") ||
    lower.includes("unpaid") ||
    lower.includes("ожидает") ||
    lower.includes("pending") ||
    lower === "не оплачен" ||
    lower === "неоплачен"
  ) {
    return "unpaid";
  }
  if (lower.includes("отменен") || lower.includes("аннулирован") || lower.includes("отменён") || lower.includes("cancelled") || lower.includes("canceled")) {
    return "cancelled";
  }
  if (lower.includes("частично") || lower.includes("partial") || lower.includes("частичн")) return "partial";
  if (lower.includes("оплачен") || lower.includes("paid") || lower.includes("оплачён")) return "paid";
  return "unknown";
}

export function getInvoicePaymentFilterKey(
  inv: Record<string, unknown> | null | undefined,
  finance?: InvoicePaymentFinance,
): PaymentFilterKey {
  const raw = String(
    inv?.StateBill ??
      inv?.stateBill ??
      inv?.Status ??
      inv?.State ??
      inv?.state ??
      inv?.Статус ??
      inv?.status ??
      inv?.PaymentStatus ??
      "",
  );
  const fromRaw = getPaymentFilterKey(raw || undefined);
  if (fromRaw === "cancelled") return fromRaw;
  if (finance && finance.sum > 0) {
    const ui = invoicePaymentStatusForUi(raw, finance.sum, finance.paid, finance.balance);
    if (ui === "Оплачен") return "paid";
    if (ui === "Оплачен частично") return "partial";
    if (ui === "Не оплачен") return "unpaid";
  }
  return fromRaw;
}
