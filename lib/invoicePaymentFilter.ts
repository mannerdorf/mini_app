/** Как в src/lib/statusUtils.ts — фильтр оплаты счёта для документов. */

import { invoicePaymentStatusForUi } from "../src/lib/formatUtils.js";
import { invoicePaymentStateRaw } from "./invoicePaymentState.js";

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

export type InvoicePaymentFilterContext = {
  finance?: InvoicePaymentFinance;
  cargoStateBillByNumber?: Map<string, string>;
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null;
};

export function getInvoicePaymentFilterKey(
  inv: Record<string, unknown> | null | undefined,
  ctx?: InvoicePaymentFinance | InvoicePaymentFilterContext,
): PaymentFilterKey {
  const context: InvoicePaymentFilterContext =
    ctx && "sum" in ctx ? { finance: ctx } : (ctx ?? {});
  const { finance, cargoStateBillByNumber, getFirstCargoNumber } = context;
  const raw = inv ? invoicePaymentStateRaw(inv, cargoStateBillByNumber, getFirstCargoNumber) : "";
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
