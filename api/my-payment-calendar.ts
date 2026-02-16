import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

/**
 * GET /api/my-payment-calendar
 * Возвращает условия оплаты (days_to_pay) только для ИНН текущего пользователя.
 * Auth: POST body { login, password } или JSON body.
 * Используется дашбордом планового поступления денег (у кого включена аналитика).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: { login?: string; password?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Неверный JSON" });
    }
  }

  const login = body?.login;
  const password = body?.password;

  if (!login || !password) {
    return res.status(400).json({ error: "Укажите login и password" });
  }

  try {
    const pool = getPool();
    const verified = await verifyRegisteredUser(pool, String(login), String(password));
    if (!verified) {
      return res.status(401).json({ error: "Неверный email или пароль" });
    }

    const inns: string[] = [];
    if (verified.inn) inns.push(verified.inn.trim());
    const { rows: acRows } = await pool.query<{ inn: string }>(
      "SELECT inn FROM account_companies WHERE login = $1",
      [String(login).trim().toLowerCase()]
    );
    acRows.forEach((r) => {
      const v = r.inn?.trim();
      if (v && !inns.includes(v)) inns.push(v);
    });
    if (inns.length === 0) {
      return res.status(200).json({ items: [] });
    }

    let rows: { inn: string; days_to_pay: number; payment_weekdays?: number[] | null }[];
    try {
      const result = await pool.query<{ inn: string; days_to_pay: number; payment_weekdays?: number[] | null }>(
        "SELECT inn, days_to_pay, COALESCE(payment_weekdays, ARRAY[]::integer[]) AS payment_weekdays FROM payment_calendar WHERE inn = ANY($1)",
        [inns]
      );
      rows = result.rows;
    } catch (colErr: unknown) {
      if (String(colErr).includes("payment_weekdays") || String((colErr as Error)?.message).includes("payment_weekdays")) {
        const fallback = await pool.query<{ inn: string; days_to_pay: number }>(
          "SELECT inn, days_to_pay FROM payment_calendar WHERE inn = ANY($1)",
          [inns]
        );
        rows = fallback.rows.map((r) => ({ ...r, payment_weekdays: [] }));
      } else {
        throw colErr;
      }
    }
    const items = rows.map((r) => ({
      inn: r.inn,
      days_to_pay: r.days_to_pay,
      payment_weekdays: Array.isArray(r.payment_weekdays) ? r.payment_weekdays.filter((d) => d >= 1 && d <= 5) : [],
    }));

    let workSchedules: { inn: string; days_of_week: number[]; work_start: string; work_end: string }[] = [];
    try {
      const wsResult = await pool.query<{ inn: string; days_of_week: number[]; work_start: string; work_end: string }>(
        "SELECT inn, COALESCE(days_of_week, ARRAY[1,2,3,4,5]::smallint[])::integer[] AS days_of_week, work_start::text, work_end::text FROM customer_work_schedule WHERE inn = ANY($1)",
        [inns]
      );
      workSchedules = wsResult.rows.map((r) => {
        const ws = String(r.work_start || "09:00").slice(0, 5);
        const we = String(r.work_end || "18:00").slice(0, 5);
        return {
          inn: r.inn,
          days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week.filter((d) => d >= 1 && d <= 7) : [1, 2, 3, 4, 5],
          work_start: /^\d{1,2}:\d{2}$/.test(ws) ? ws : "09:00",
          work_end: /^\d{1,2}:\d{2}$/.test(we) ? we : "18:00",
        };
      });
    } catch {
      // customer_work_schedule может отсутствовать до миграции 024
    }
    return res.status(200).json({ items, work_schedules: workSchedules });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("my-payment-calendar error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}
