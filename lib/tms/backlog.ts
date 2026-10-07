import type { Pool } from "pg";
import type { TmsCargo, Readiness } from "../../src/features/tms/model.js";
import { cityToCode } from "../cityToCode.js";
export const cleanNumber = (n: unknown) =>
  String(n ?? "")
    .trim()
    .replace(/^0+/, "");
const text = (x: unknown) => (typeof x === "string" ? x.trim() : "");
export function amount(x: unknown): number | null {
  if (x === null || x === undefined || String(x).trim() === "") return null;
  const n = Number(String(x).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export const validDate = (x: unknown) =>
  /^\d{4}-\d{2}-\d{2}/.test(String(x)) &&
  Number(String(x).slice(0, 4)) > 1900 &&
  Number.isFinite(Date.parse(String(x)));
export function terminal(item: Record<string, unknown>): boolean {
  return (
    validDate(item.DateVr) ||
    /доставлен|заверш|готово?\s*к\s*выдаче|месте\s*прибытия|отмен|возврат/i.test(
      text(item.State),
    )
  );
}
/** Availability comes from the synchronized DB; sending membership is excluded by readBacklog. */
export function readiness(item: Record<string, unknown>): {
  readiness: Readiness;
  reason: string;
} {
  if (terminal(item))
    return {
      readiness: "dispatched",
      reason: "Перевозка завершена или отменена",
    };
  if (!validDate(item.DatePrih))
    return { readiness: "unreceived", reason: "В БД нет даты поступления" };
  return {
    readiness: "ready",
    reason: "Есть дата поступления, связи с отправкой в БД нет",
  };
}
export function normalizeCargo(
  item: Record<string, unknown>,
  updatedAt: string | null,
): TmsCargo {
  const number = cleanNumber(item.Number),
    inn = text(item.INN),
    customer = text(item.Customer) || "Без заказчика";
  return {
    id: `${inn}:${number}`,
    number,
    customer,
    customerId: inn || customer,
    receiver: text(item.Receiver) || "Без получателя",
    received: validDate(item.DatePrih)
      ? String(item.DatePrih).slice(0, 10)
      : "",
    route: `${cityToCode(item.CitySender) || "?"} → ${cityToCode(item.CityReceiver) || "?"}`,
    weight: amount(item.W),
    volume: amount(item.Value),
    places: amount(item.Mest),
    ...readiness(item),
    updatedAt,
  };
}
export async function readBacklog(pool: Pool, numbers?: string[]) {
  // No receipt-period limit: old consignments must remain available to the planner.
  const { rows } = await pool.query<{
    payload: Record<string, unknown>;
    updated_at: Date;
    assigned: boolean;
  }>(
    `
    WITH assigned AS (SELECT DISTINCT ltrim(btrim(value),'0') AS number
      FROM sendings_metrics, jsonb_array_elements_text(cargo_numbers))
    SELECT r.payload,r.updated_at, a.number IS NOT NULL AS assigned
    FROM cache_perevozki_rows r LEFT JOIN assigned a ON a.number=ltrim(btrim(r.doc_number),'0')
    WHERE ($1::text[] IS NULL OR ltrim(btrim(r.doc_number),'0')=ANY($1::text[]))
      AND NOT (coalesce(r.payload->>'State','') ~* 'доставлен|заверш|готов.*выдаче|месте.*прибытия|отмен|возврат')
    ORDER BY r.doc_date DESC NULLS LAST,r.doc_number`,
    [numbers ?? null],
  );
  const available = rows.filter((r) => !r.assigned && !terminal(r.payload));
  return { rows: available, assigned: rows.filter((r) => r.assigned).length };
}
