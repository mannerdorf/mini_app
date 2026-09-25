import { getInvoicePaymentFilterKey, type InvoicePaymentFinance } from "./invoicePaymentFilter.js";

/** Деньги в счетах/письме — всегда с копейками. */
export function formatInvoiceMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function parseDocAmount(val: unknown): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const s = String(val).trim();
  if (!s) return 0;
  const normalized = s.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : 0;
}

const INVOICE_SUM_HEADER_FIELDS = [
  "Sum",
  "sum",
  "Сумма",
  "Amount",
  "SumDoc",
  "SumInvoice",
  "SumBill",
  "СуммаДокумента",
  "СуммаСчета",
  "СуммаСчёта",
  "Total",
  "TotalSum",
  "SumTotal",
  "DocumentSum",
  "СуммаСНДС",
  "SumWithVAT",
];

function sumFromInvoiceList(inv: Record<string, unknown>): number {
  const list = inv.List ?? inv.list ?? inv.Строки ?? inv.Items ?? inv.items;
  if (!Array.isArray(list) || list.length === 0) return 0;
  let total = 0;
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const lineSum = parseDocAmount(r.Sum ?? r.sum ?? r.Сумма ?? r.Amount ?? r.СуммаСтроки);
    if (lineSum > 0) {
      total += lineSum;
      continue;
    }
    const qty = parseDocAmount(r.Quantity ?? r.quantity ?? r.Количество ?? r.Qty);
    const price = parseDocAmount(r.Price ?? r.price ?? r.Цена);
    if (qty > 0 && price > 0) total += qty * price;
  }
  return total;
}

/** Сумма счёта: заголовок документа, иначе сумма строк List (SumDoc=0 не блокирует Sum). */
export function invoiceDocSum(inv: Record<string, unknown>): number {
  for (const key of INVOICE_SUM_HEADER_FIELDS) {
    const n = parseDocAmount(inv[key]);
    if (n > 0) return n;
  }
  const fromList = sumFromInvoiceList(inv);
  if (fromList > 0) return fromList;
  return 0;
}

function cargoPaidFromRecord(c: Record<string, unknown>): number {
  return parseDocAmount(c.Sum_paid ?? c.SumPaid ?? c.sum_paid ?? c.sumPaid);
}

export function lookupCargoMapAmount(map: Map<string, number> | undefined, cargoNum: string | null): number {
  if (!map?.size || !cargoNum) return 0;
  const raw = String(cargoNum).replace(/^0000-/, "").trim();
  if (!raw) return 0;
  const key = raw.replace(/^0+/, "") || raw;
  return map.get(key) ?? map.get(raw) ?? 0;
}

/** Оплачено по номеру перевозки (как в карточке груза). */
export function buildCargoSumPaidByNumber(perevozkiItems: Record<string, unknown>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of perevozkiItems) {
    const raw = String(c.Number ?? c.number ?? "")
      .replace(/^0000-/, "")
      .trim();
    if (!raw) continue;
    const paid = cargoPaidFromRecord(c);
    if (paid <= 0) continue;
    const key = raw.replace(/^0+/, "") || raw;
    m.set(key, paid);
    if (key !== raw) m.set(raw, paid);
  }
  return m;
}

/** Оплачено только по полям счёта / перевозки (без вывода из текстового статуса). */
function invoiceSumPaidFromFieldsOnly(
  inv: Record<string, unknown>,
  cargoSumPaidByNumber?: Map<string, number>,
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null,
): number {
  const sum = invoiceDocSum(inv);
  const explicit = parseDocAmount(
    inv.Sum_paid ?? inv.SumPaid ?? inv.sum_paid ?? inv.sumPaid ?? inv.SumPay ?? inv.PaidSum ?? inv.Оплачено,
  );
  if (explicit > 0) return Math.min(explicit, sum);

  if (cargoSumPaidByNumber && getFirstCargoNumber) {
    const fromCargo = lookupCargoMapAmount(cargoSumPaidByNumber, getFirstCargoNumber(inv));
    if (fromCargo > 0) return Math.min(fromCargo, sum);
  }
  return 0;
}

function invoicePaymentFinance(
  inv: Record<string, unknown>,
  cargoSumPaidByNumber?: Map<string, number>,
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null,
): InvoicePaymentFinance {
  const sum = invoiceDocSum(inv);
  const paid = invoiceSumPaidFromFieldsOnly(inv, cargoSumPaidByNumber, getFirstCargoNumber);
  return { sum, paid, balance: Math.max(0, sum - paid) };
}

function resolveInvoicePaymentFilterKey(
  inv: Record<string, unknown>,
  cargoSumPaidByNumber?: Map<string, number>,
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null,
) {
  return getInvoicePaymentFilterKey(inv, invoicePaymentFinance(inv, cargoSumPaidByNumber, getFirstCargoNumber));
}

/** Оплаченная сумма: счёт → перевозка → статус. */
export function invoiceSumPaid(
  inv: Record<string, unknown>,
  cargoSumPaidByNumber?: Map<string, number>,
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null,
): number {
  const sum = invoiceDocSum(inv);
  const fromFields = invoiceSumPaidFromFieldsOnly(inv, cargoSumPaidByNumber, getFirstCargoNumber);
  if (fromFields > 0) return fromFields;

  const key = resolveInvoicePaymentFilterKey(inv, cargoSumPaidByNumber, getFirstCargoNumber);
  if (key === "paid") return sum;
  if (key === "unpaid" || key === "cancelled") return 0;
  return 0;
}

/** Счёт попадает в блок «Финансы» письма: неоплаченные и частично оплаченные. */
export function isOutstandingFinanceInvoice(
  inv: Record<string, unknown>,
  cargoSumPaidByNumber?: Map<string, number>,
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null,
): boolean {
  const key = resolveInvoicePaymentFilterKey(inv, cargoSumPaidByNumber, getFirstCargoNumber);
  if (key === "paid" || key === "cancelled") return false;
  if (key === "unpaid" || key === "partial") return true;
  return invoiceBalance(inv, cargoSumPaidByNumber, getFirstCargoNumber) > 0.005;
}

/**
 * Задолженность для монитора и раздела «Счета»: статус «Не оплачен».
 * Частично оплаченные не включаем; без StateBill — по остатку (как бейдж в таблице).
 */
export function isOutstandingDebtInvoice(
  inv: Record<string, unknown>,
  cargoSumPaidByNumber?: Map<string, number>,
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null,
): boolean {
  const key = resolveInvoicePaymentFilterKey(inv, cargoSumPaidByNumber, getFirstCargoNumber);
  if (key === "paid" || key === "cancelled" || key === "partial") return false;
  return key === "unpaid";
}

/** Остаток к оплате: сумма счёта − оплачено. */
export function invoiceBalance(
  inv: Record<string, unknown>,
  cargoSumPaidByNumber?: Map<string, number>,
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null,
): number {
  const sum = invoiceDocSum(inv);
  return Math.max(0, sum - invoiceSumPaid(inv, cargoSumPaidByNumber, getFirstCargoNumber));
}
