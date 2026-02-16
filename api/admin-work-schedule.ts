import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";

/**
 * GET /api/admin-work-schedule
 * Список рабочих графиков (ИНН, наименование, дни недели, часы). Только суперадмин.
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
    const { rows } = await pool.query(
      `SELECT ws.inn, cc.customer_name,
        COALESCE(ws.days_of_week, ARRAY[1,2,3,4,5]::smallint[])::integer[] AS days_of_week,
        ws.work_start::text, ws.work_end::text
       FROM customer_work_schedule ws
       LEFT JOIN cache_customers cc ON cc.inn = ws.inn
       ORDER BY COALESCE(cc.customer_name, ws.inn)`
    );
    const items = rows.map((r: { inn: string; customer_name: string | null; days_of_week: number[]; work_start: string; work_end: string }) => ({
      inn: r.inn,
      customer_name: r.customer_name,
      days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week.filter((d) => d >= 1 && d <= 7) : [1, 2, 3, 4, 5],
      work_start: String(r.work_start || "09:00").slice(0, 5),
      work_end: String(r.work_end || "18:00").slice(0, 5),
    }));
    return res.status(200).json({ items });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-work-schedule GET error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}

function normalizeInns(body: { inns?: string[]; inn?: string }): string[] {
  const inns: string[] = [];
  if (Array.isArray(body.inns) && body.inns.length > 0) {
    inns.push(...body.inns.map((x) => String(x).replace(/\D/g, "").trim()).filter((x) => x.length === 10 || x.length === 12));
  }
  if (typeof body.inn === "string") {
    const one = body.inn.replace(/\D/g, "").trim();
    if ((one.length === 10 || one.length === 12) && !inns.includes(one)) inns.push(one);
  }
  return inns;
}

function normalizeDaysOfWeek(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === "number" && Number.isInteger(x) ? x : parseInt(String(x), 10)))
    .filter((d) => !Number.isNaN(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b);
}

function parseTime(s: unknown): string | null {
  if (s == null || typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * POST /api/admin-work-schedule
 * Установить график работы для одного или нескольких заказчиков.
 * Body: { inns?: string[], inn?: string, days_of_week?: number[], work_start?: string, work_end?: string }
 * days_of_week: 1=пн … 7=вс
 * work_start, work_end: "HH:MM"
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

  let body: { inns?: string[]; inn?: string; days_of_week?: number[]; work_start?: string; work_end?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Неверный JSON" });
    }
  }

  const inns = normalizeInns(body);
  if (inns.length === 0) {
    return res.status(400).json({ error: "Укажите inn или inns (ИНН заказчиков)" });
  }

  const daysOfWeek = body.days_of_week !== undefined ? normalizeDaysOfWeek(body.days_of_week) : null;
  const workStart = body.work_start !== undefined ? parseTime(body.work_start) : null;
  const workEnd = body.work_end !== undefined ? parseTime(body.work_end) : null;

  if (daysOfWeek === null && workStart === null && workEnd === null) {
    return res.status(400).json({ error: "Укажите days_of_week и/или work_start и/или work_end" });
  }

  try {
    const pool = getPool();
    for (const inn of inns) {
      await pool.query(
        `INSERT INTO customer_work_schedule (inn, days_of_week, work_start, work_end, updated_at)
         VALUES ($1, COALESCE($2, ARRAY[1,2,3,4,5]::smallint[]), COALESCE($3::time, '09:00'), COALESCE($4::time, '18:00'), now())
         ON CONFLICT (inn) DO UPDATE SET
           days_of_week = CASE WHEN $2 IS NOT NULL THEN $2 ELSE customer_work_schedule.days_of_week END,
           work_start = CASE WHEN $3 IS NOT NULL THEN $3::time ELSE customer_work_schedule.work_start END,
           work_end = CASE WHEN $4 IS NOT NULL THEN $4::time ELSE customer_work_schedule.work_end END,
           updated_at = now()`,
        [inn, daysOfWeek, workStart, workEnd]
      );
    }
    return res.status(200).json({ ok: true, updated: inns.length });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-work-schedule POST error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка сохранения" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
