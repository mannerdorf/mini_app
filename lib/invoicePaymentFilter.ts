/** Как в src/lib/statusUtils.ts — фильтр оплаты счёта для документов. */

export type PaymentFilterKey = "unpaid" | "cancelled" | "paid" | "partial" | "unknown";

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

export function getInvoicePaymentFilterKey(inv: Record<string, unknown> | null | undefined): PaymentFilterKey {
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
  return getPaymentFilterKey(raw);
}
