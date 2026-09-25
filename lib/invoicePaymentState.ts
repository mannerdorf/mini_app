function looksLikePaymentStatus(status: string): boolean {
  const l = status.toLowerCase().trim();
  if (!l) return false;
  if (
    l.includes("не оплачен") ||
    l.includes("неоплачен") ||
    l.includes("unpaid") ||
    l.includes("ожидает") ||
    l.includes("pending") ||
    l.includes("отменен") ||
    l.includes("аннулирован") ||
    l.includes("cancelled") ||
    l.includes("частично") ||
    l.includes("partial") ||
    l.includes("оплачен") ||
    l.includes("paid")
  ) {
    return true;
  }
  return false;
}

/** Статус перевозки из 1С — не подставляем его как статус оплаты счёта. */
export function looksLikeLogisticsStatus(status: string): boolean {
  const l = status.toLowerCase().trim();
  if (!l) return false;
  if (l.includes("оплач") || l.includes("paid") || l.includes("ожидает") || l.includes("pending")) return false;
  return (
    l.includes("достав") ||
    l.includes("пути") ||
    l.includes("транзит") ||
    l.includes("отправ") ||
    l.includes("готов") ||
    l.includes("принят") ||
    l.includes("получена") ||
    l.includes("аэропорт") ||
    l.includes("улетел") ||
    l.includes("выдач") ||
    l.includes("склад")
  );
}

const INVOICE_PAYMENT_FIELD_KEYS = [
  "StateBill",
  "stateBill",
  "StatusBill",
  "statusBill",
  "PaymentStatus",
  "paymentStatus",
  "PayStatus",
  "payStatus",
  "BillStatus",
  "billStatus",
  "StatePay",
  "СтатусСчета",
  "СтатусОплаты",
] as const;

function lookupCargoStateBill(map: Map<string, string> | undefined, cargoNum: string | null): string {
  if (!map?.size || !cargoNum) return "";
  const raw = String(cargoNum).replace(/^0000-/, "").trim();
  if (!raw) return "";
  const key = raw.replace(/^0+/, "") || raw;
  return map.get(key) ?? map.get(raw) ?? "";
}

/** Текст статуса оплаты: только поля счёта и StateBill связанной перевозки (не Status «Доставлено»). */
export function invoicePaymentStateRaw(
  inv: Record<string, unknown>,
  cargoStateBillByNumber?: Map<string, string>,
  getFirstCargoNumber?: (inv: Record<string, unknown>) => string | null,
): string {
  for (const key of INVOICE_PAYMENT_FIELD_KEYS) {
    const v = inv[key];
    if (v != null && typeof v !== "object") {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  for (const key of ["Status", "State", "state", "Статус", "status"] as const) {
    const s = String(inv[key] ?? "").trim();
    if (!s || looksLikeLogisticsStatus(s)) continue;
    if (looksLikePaymentStatus(s)) return s;
  }
  if (cargoStateBillByNumber && getFirstCargoNumber) {
    const fromCargo = lookupCargoStateBill(cargoStateBillByNumber, getFirstCargoNumber(inv));
    if (fromCargo) return fromCargo;
  }
  return "";
}

/** Для lookupCargoMapAmount-стиля по строковым значениям (StateBill перевозки). */
export function buildCargoStateBillByNumber(perevozkiItems: Record<string, unknown>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of perevozkiItems) {
    const raw = String(c.Number ?? c.number ?? "")
      .replace(/^0000-/, "")
      .trim();
    if (!raw) continue;
    const stateBill = String(c.StateBill ?? c.stateBill ?? c.StatusBill ?? "").trim();
    if (!stateBill) continue;
    const key = raw.replace(/^0+/, "") || raw;
    m.set(key, stateBill);
    if (key !== raw) m.set(raw, stateBill);
  }
  return m;
}

export function lookupCargoMapString(map: Map<string, string> | undefined, cargoNum: string | null): string {
  if (!map?.size || !cargoNum) return "";
  const raw = String(cargoNum).replace(/^0000-/, "").trim();
  if (!raw) return "";
  const key = raw.replace(/^0+/, "") || raw;
  return map.get(key) ?? map.get(raw) ?? "";
}
