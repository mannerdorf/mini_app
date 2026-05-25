import { getInvoicePaymentFilterKey } from "./invoicePaymentFilter.js";

export function parseDocAmount(val: unknown): number {
  if (val === undefined || val === null || (typeof val === "string" && val.trim() === "")) return 0;
  const num = typeof val === "string" ? parseFloat(val.replace(",", ".")) : Number(val);
  return Number.isFinite(num) ? num : 0;
}

export function invoiceDocSum(inv: Record<string, unknown>): number {
  return parseDocAmount(inv.SumDoc ?? inv.Sum ?? inv.sum ?? inv.Сумма ?? inv.Amount);
}

/** Оплаченная сумма по счёту (Sum_paid из 1С или по статусу оплаты). */
export function invoiceSumPaid(inv: Record<string, unknown>): number {
  const sum = invoiceDocSum(inv);
  const explicit = parseDocAmount(
    inv.Sum_paid ?? inv.SumPaid ?? inv.sum_paid ?? inv.sumPaid ?? inv.SumPay ?? inv.PaidSum ?? inv.Оплачено,
  );
  if (explicit > 0) return Math.min(explicit, sum);
  const key = getInvoicePaymentFilterKey(inv);
  if (key === "paid") return sum;
  if (key === "unpaid" || key === "cancelled") return 0;
  return 0;
}

/** Остаток к оплате: сумма счёта − оплачено. */
export function invoiceBalance(inv: Record<string, unknown>): number {
  const sum = invoiceDocSum(inv);
  return Math.max(0, sum - invoiceSumPaid(inv));
}
