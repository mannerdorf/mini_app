/** Ставка НДС в коммерческом предложении калькулятора (в том числе в итоговой сумме). */
export const HAULZ_QUOTE_VAT_PERCENT = 5;

/** Сумма НДС, включённая в итог с НДС: total × rate / (100 + rate). */
export function vatAmountIncludedInTotal(totalRub: number, vatPercent = HAULZ_QUOTE_VAT_PERCENT): number {
  if (!Number.isFinite(totalRub) || totalRub <= 0) return 0;
  const p = Math.max(0, vatPercent);
  return Math.round(((totalRub * p) / (100 + p)) * 100) / 100;
}

export function formatQuoteVatLine(totalRub: number, vatPercent = HAULZ_QUOTE_VAT_PERCENT): string {
  const vat = vatAmountIncludedInTotal(totalRub, vatPercent);
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(vat);
  return `в том числе НДС ${vatPercent}% ${formatted} ₽`;
}
