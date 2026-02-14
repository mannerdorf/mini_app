import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";

export type PaymentCalendarRow = { inn: string; customer_name: string | null; days_to_pay: number };

/**
 * GET /api/admin-payment-calendar
 * Список условий оплаты (ИНН, наименование, дней на оплату). Только суперадмин.
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
    const { rows } = await pool.query<{ inn: string; customer_name: string | null; days_to_pay: number }>(
      `SELECT pc.inn, cc.customer_name, pc.days_to_pay
       FROM payment_calendar pc
       LEFT JOIN cache_customers cc ON cc.inn = pc.inn
       ORDER BY COALESCE(cc.customer_name, pc.inn)`
    );
    return res.status(200).json({ items: rows });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-payment-calendar GET error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}

/**
 * POST /api/admin-payment-calendar
 * Установить срок оплаты (дней с момента выставления счёта) для одного или нескольких заказчиков.
 * Body: { inns: string[], days_to_pay: number } или { inn: string, days_to_pay: number }
 * Только суперадмин.
 */
async function handlePost(req: VercelRequest, res: VercelResponse) {
  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!payload?.admin) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }
  if (payload.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадмина" });
  }

  let body: { inns?: string[]; inn?: string; days_to_pay?: number } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Неверный JSON" });
    }
  }

  const daysToPay = typeof body?.days_to_pay === "number" ? Math.max(0, Math.floor(body.days_to_pay)) : undefined;
  if (daysToPay === undefined) {
    return res.status(400).json({ error: "Укажите days_to_pay (число дней)" });
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

  try {
    const pool = getPool();
    for (const inn of inns) {
      await pool.query(
        `INSERT INTO payment_calendar (inn, days_to_pay, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (inn) DO UPDATE SET days_to_pay = $2, updated_at = now()`,
        [inn, daysToPay]
      );
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
