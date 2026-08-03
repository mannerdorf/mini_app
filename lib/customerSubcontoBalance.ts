/** Парсинг суммы из полей субконто 1С (ДТ / Кт). */
export function parseSubcontoAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  const raw = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export type CustomerDebtRow = {
  contract?: string;
  document?: string;
  debit: number;
  credit: number;
};

/** Итоговый баланс по массиву debts: ΣДТ − ΣКт. */
export function balanceFromDebts(debts: unknown): number {
  if (!Array.isArray(debts)) return 0;
  let debit = 0;
  let credit = 0;
  for (const row of debts) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    debit += parseSubcontoAmount(o.ДТ ?? o.DT ?? o.dt ?? o.Debit ?? o.debit);
    credit += parseSubcontoAmount(o.Кт ?? o.KT ?? o.kt ?? o.Credit ?? o.credit);
  }
  return Math.round((debit - credit) * 100) / 100;
}

export function normalizeDebtRows(debts: unknown): CustomerDebtRow[] {
  if (!Array.isArray(debts)) return [];
  return debts
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const o = row as Record<string, unknown>;
      return {
        contract: String(o.договор ?? o.Contract ?? o.contract ?? "").trim() || undefined,
        document: String(o.документ ?? o.Document ?? o.document ?? "").trim() || undefined,
        debit: parseSubcontoAmount(o.ДТ ?? o.DT ?? o.dt ?? o.Debit),
        credit: parseSubcontoAmount(o.Кт ?? o.KT ?? o.kt ?? o.Credit),
      };
    });
}

export type ParsedCustomerSubconto = {
  inn: string;
  name: string;
  email?: string;
  status?: string;
  balance: number;
  debtsCount: number;
  debts?: CustomerDebtRow[];
};

function getStr(el: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = el[key];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

/** Разбор ответа GetCustomer / элемента Getcustomers с полем debts. */
export function parseCustomerSubcontoPayload(raw: unknown): ParsedCustomerSubconto | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const inn = getStr(o, "Inn", "INN", "inn", "ИНН").replace(/\D/g, "") || getStr(o, "Inn", "INN", "inn", "ИНН");
  if (!inn) return null;
  const name =
    getStr(o, "name", "Name", "Customer", "customer", "Contragent", "Наименование") || inn;
  const email = getStr(o, "Email", "email", "E-mail", "Почта") || undefined;
  const status = getStr(o, "status", "Status") || undefined;
  const debts = o.debts ?? o.Debts ?? o.debt ?? o.Debt;
  const balance = balanceFromDebts(debts);
  const debtRows = normalizeDebtRows(debts);
  return {
    inn,
    name,
    email,
    status,
    balance,
    debtsCount: debtRows.length,
    debts: debtRows.length > 0 ? debtRows : undefined,
  };
}
