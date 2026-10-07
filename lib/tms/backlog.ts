import type { Pool } from "pg";
import type { TmsCargo, Readiness } from "../../src/features/tms/model.js";
import { cityToCode } from "../cityToCode.js";
import { normalizePerevozkaSteps } from "../../api/lib/postbGetapiNormalize.js";
import { fetchTimelineFrom1C } from "../cargoTimelineReportBuild.js";
import { getPerevozkiServiceCredentials } from "../cacheHistoryDays.js";
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
export function readiness(payload: unknown): {
  readiness: Readiness;
  reason: string;
} {
  const steps = normalizePerevozkaSteps(payload).filter((s) =>
    validDate(s.date),
  );
  if (
    steps.some((s) =>
      /отправлен|улетел|в\s*пути|загружен|к\s*вручению|доставлен|прибыл|отмен|возврат/i.test(
        s.title,
      ),
    )
  )
    return {
      readiness: "dispatched",
      reason: "Уже загружена, отправлена или завершена по этапам 1С",
    };
  if (
    steps.some((s) =>
      /получена?\s*(от\s*заказчика|на\s*складе|в\s*(MSK|KGD|Моск|Калининг))|упакован|измерен|консолидац/i.test(
        s.title,
      ),
    )
  )
    return {
      readiness: "ready",
      reason: "Принята на складе, отправка не зафиксирована",
    };
  if (steps.some((s) => /получена\s*информация/i.test(s.title)))
    return {
      readiness: "unreceived",
      reason: "Есть информация о грузе, приёмка ещё не подтверждена",
    };
  return {
    readiness: "unknown",
    reason: "Не удалось подтвердить этапы перевозки в 1С",
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
    readiness: "pending",
    reason: "Проверяем приёмку и отправку",
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
const verified = new Map<
  string,
  { until: number; value: ReturnType<typeof readiness> }
>();
const pending = new Map<string, Promise<ReturnType<typeof readiness>>>();
export async function checkCargo(
  item: Record<string, unknown>,
  updatedAt: string,
): Promise<ReturnType<typeof readiness>> {
  const key = `${text(item.INN)}:${cleanNumber(item.Number)}:${updatedAt}`;
  const cached = verified.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  const running = pending.get(key);
  if (running) return running;
  const task = (async () => {
    const credentials = getPerevozkiServiceCredentials();
    if (!credentials)
      return {
        readiness: "unknown" as const,
        reason: "Не настроено подключение к 1С",
      };
    const payload = await fetchTimelineFrom1C(
      String(item.Number),
      text(item.INN),
      credentials.login,
      credentials.password,
      8000,
    );
    const value = readiness(payload);
    if (verified.size > 5000) verified.clear();
    if (value.readiness !== "unknown")
      verified.set(key, { until: Date.now() + 120000, value });
    return value;
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
