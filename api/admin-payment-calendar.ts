import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";

export type PaymentCalendarRow = { inn: string; customer_name: string | null; days_to_pay: number; payment_weekdays: number[] };

/**
 * GET /api/admin-payment-calendar
 * Список условий оплаты (ИНН, наименование, дней на оплату, платежные дни недели). Только суперадмин.
 */
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!payload?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  if (payload.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадмина" });
  }

  try {
    const pool = getPool();
    let rows: { inn: string; customer_name: string | null; days_to_pay: number; payment_weekdays?: number[] | null }[];
    try {
      const result = await pool.query(
        `SELECT pc.inn, cc.customer_name, pc.days_to_pay, COALESCE(pc.payment_weekdays, ARRAY[]::integer[]) AS payment_weekdays
         FROM payment_calendar pc
         LEFT JOIN cache_customers cc ON cc.inn = pc.inn
         ORDER BY COALESCE(cc.customer_name, pc.inn)`
      );
      rows = result.rows;
    } catch (colErr: unknown) {
      if (String(colErr).includes("payment_weekdays") || String((colErr as Error)?.message).includes("payment_weekdays")) {
        const fallback = await pool.query(
          `SELECT pc.inn, cc.customer_name, pc.days_to_pay
           FROM payment_calendar pc
           LEFT JOIN cache_customers cc ON cc.inn = pc.inn
           ORDER BY COALESCE(cc.customer_name, pc.inn)`
        );
        rows = fallback.rows.map((r: { inn: string; customer_name: string | null; days_to_pay: number }) => ({ ...r, payment_weekdays: [] }));
      } else {
        throw colErr;
      }
    }
    const items = rows.map((r) => ({
      inn: r.inn,
      customer_name: r.customer_name,
      days_to_pay: r.days_to_pay,
      payment_weekdays: Array.isArray(r.payment_weekdays) ? r.payment_weekdays.filter((d) => d >= 1 && d <= 5) : [],
    }));
    return res.status(200).json({ items });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-payment-calendar GET error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}

/**
 * POST /api/admin-payment-calendar
 * Установить срок оплаты и/или платежные дни недели для одного или нескольких заказчиков.
 * Body: { inns?: string[], inn?: string, days_to_pay?: number, payment_weekdays?: number[] }
 * payment_weekdays: только рабочие дни (1=пн … 5=пт). Выходные не сохраняются.
 * Только суперадмин.
 */
function normalizePaymentWeekdays(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === "number" && Number.isInteger(x) ? x : parseInt(String(x), 10)))
    .filter((d) => !Number.isNaN(d) && d >= 1 && d <= 5);
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!payload?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  if (payload.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадмина" });
  }

  let body: { inns?: string[]; inn?: string; days_to_pay?: number; payment_weekdays?: number[] } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Неверный JSON" });
    }
  }

  const inns: string[] = [];
  if (Array.isArray(body.inns) && body.inns.length > 0) {
    inns.push(...body.inns.map((x) => String(x).replace(/\D/g, "").trim()).filter((x) => x.length === 10 || x.length === 12));
  }
  if (typeof body.inn === "string") {
    const one = body.inn.replace(/\D/g, "").trim();
    if ((one.length === 10 || one.length === 12) && !inns.includes(one)) inns.push(one);
  }
  if (inns.length === 0) {
    return res.status(400).json({ error: "Укажите inn или inns (ИНН заказчиков)" });
  }

  const daysToPay = typeof body?.days_to_pay === "number" ? Math.max(0, Math.floor(body.days_to_pay)) : null;
  const paymentWeekdaysRaw = body?.payment_weekdays;
  const paymentWeekdays =
    paymentWeekdaysRaw === undefined ? null : normalizePaymentWeekdays(Array.isArray(paymentWeekdaysRaw) ? paymentWeekdaysRaw : [paymentWeekdaysRaw]);

  if (daysToPay === null && paymentWeekdays === null) {
    return res.status(400).json({ error: "Укажите days_to_pay и/или payment_weekdays" });
  }

  try {
    const pool = getPool();
    for (const inn of inns) {
      if (daysToPay !== null) {
        await pool.query(
          `INSERT INTO payment_calendar (inn, days_to_pay, payment_weekdays, updated_at)
           VALUES ($1, $2, COALESCE($3, ARRAY[]::integer[]), now())
           ON CONFLICT (inn) DO UPDATE SET
             days_to_pay = $2,
             payment_weekdays = CASE WHEN $3 IS NOT NULL THEN $3 ELSE payment_calendar.payment_weekdays END,
             updated_at = now()`,
          [inn, daysToPay, paymentWeekdays]
        );
      } else {
        await pool.query(
          `INSERT INTO payment_calendar (inn, days_to_pay, payment_weekdays, updated_at)
           VALUES ($1, 0, $2, now())
           ON CONFLICT (inn) DO UPDATE SET payment_weekdays = $2, updated_at = now()`,
          [inn, paymentWeekdays ?? []]
        );
      }
    }
    return res.status(200).json({ ok: true, updated: inns.length });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-payment-calendar POST error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка сохранения" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
