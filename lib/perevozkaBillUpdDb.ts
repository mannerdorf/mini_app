import type { Pool } from "pg";

/** Варианты строки номера перевозки для сопоставления с cargo_number в БД. */
export function cargoNumberLookupKeys(num: unknown): string[] {
  const trimmed = String(num ?? "").trim();
  if (!trimmed) return [];
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(trimmed);
  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    add(digits);
    const noLead = digits.replace(/^0+/, "") || digits;
    add(noLead);
    if (digits.length > 0 && digits.length < 9) add(digits.padStart(9, "0"));
    if (noLead !== digits && noLead.length > 0 && noLead.length < 9) add(noLead.padStart(9, "0"));
  }
  return out;
}

function allLookupKeysForItems(items: any[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const k of cargoNumberLookupKeys(item?.Number ?? item?.number)) {
      set.add(k);
    }
  }
  return [...set];
}

/** Дополняет элементы массива полями BillNumber / UpdNumber из таблицы perevozka_bill_upd (мутация элементов). */
export async function mergeBillUpdIntoItems(pool: Pool, items: any[]): Promise<void> {
  if (!items.length) return;
  const keys = allLookupKeysForItems(items);
  if (!keys.length) return;
  let rows: { cargo_number: string; bill_number: string | null; upd_number: string | null }[] = [];
  try {
    const res = await pool.query<{
      cargo_number: string;
      bill_number: string | null;
      upd_number: string | null;
    }>(
      `SELECT cargo_number, bill_number, upd_number
       FROM perevozka_bill_upd
       WHERE cargo_number = ANY($1::text[])`,
      [keys]
    );
    rows = res.rows;
  } catch {
    return;
  }
  const byKey = new Map(rows.map((r) => [String(r.cargo_number).trim(), r]));
  const findRow = (item: any) => {
    for (const k of cargoNumberLookupKeys(item?.Number ?? item?.number)) {
      const r = byKey.get(k.trim());
      if (r) return r;
    }
    return null;
  };
  for (const item of items) {
    const r = findRow(item);
    if (!r) continue;
    const b = r.bill_number != null ? String(r.bill_number).trim() : "";
    const u = r.upd_number != null ? String(r.upd_number).trim() : "";
    if (b) item.BillNumber = b;
    if (u) item.UpdNumber = u;
  }
}
