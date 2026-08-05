import { invoiceBalance } from "./invoiceAmounts.js";

/** Макс. календарных дней в одном ответе /api/invoices для service mode (вся компания). */
export const MAX_SERVICE_INVOICE_RANGE_DAYS = 62;

/** Макс. строк счетов в одном ответе (после strip *_file обычно ~1 MB на тысячи строк). */
export const MAX_INVOICE_ROWS_PER_RESPONSE = 3000;

export function daysBetweenInclusive(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T12:00:00`);
  const to = new Date(`${dateTo}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  const diff = Math.round((to.getTime() - from.getTime()) / 86400000);
  return Math.max(0, diff) + 1;
}

export function clampDateFromToMaxSpan(dateFrom: string, dateTo: string, maxDays: number): string {
  if (maxDays < 1) return dateFrom;
  if (daysBetweenInclusive(dateFrom, dateTo) <= maxDays) return dateFrom;
  const to = new Date(`${dateTo}T12:00:00`);
  to.setDate(to.getDate() - (maxDays - 1));
  return to.toISOString().split("T")[0];
}

/** Base64/PDF вложения в списке счетов (иначе ответ 100–250+ MB). */
export function isHeavyInvoiceFileField(key: string): boolean {
  return key.toLowerCase().endsWith("_file");
}

/**
 * Убирает вложения (*_file) из элемента списка.
 * Статусы ЭДО (без _file) и List строк оставляем — ими пользуется UI.
 */
export function stripInvoiceFileFields(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (isHeavyInvoiceFileField(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Убирает тяжёлые поля — для виджета ЭДО на дашборде. */
export function slimInvoiceForEdoMonitor(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === "List" || key === "list" || key === "Строки" || key === "Items" || key === "items") continue;
    if (isHeavyInvoiceFileField(key)) continue;
    out[key] = value;
  }
  return out;
}

export function filterUnpaidInvoices(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return items.filter((inv) => invoiceBalance(inv) > 0.009);
}

export function capInvoiceRows<T>(items: T[], maxRows: number): { items: T[]; truncated: boolean } {
  if (items.length <= maxRows) return { items, truncated: false };
  return { items: items.slice(0, maxRows), truncated: true };
}
