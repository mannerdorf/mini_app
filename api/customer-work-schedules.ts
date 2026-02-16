import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

/**
 * POST /api/customer-work-schedules
 * Возвращает рабочие графики для указанных ИНН.
 * Body: { login, password, inns: string[] }
 * Для пользователей с access_all_inns или service_mode — все запрошенные ИНН.
 * Иначе — только ИНН из account_companies.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: { login?: string; password?: string; inns?: string[] } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Неверный JSON" });
    }
  }

  const login = body?.login;
  const password = body?.password;
  let inns: string[] = Array.isArray(body?.inns) ? body.inns.map((i) => String(i).trim()).filter(Boolean) : [];

  if (!login || !password) {
    return res.status(400).json({ error: "Укажите login и password" });
  }

  try {
    const pool = getPool();
    const verified = await verifyRegisteredUser(pool, String(login), String(password));
    if (!verified) {
      return res.status(401).json({ error: "Неверный email или пароль" });
    }

    const allowedInns = new Set<string>();
    if (verified.inn) allowedInns.add(verified.inn.trim());
    if (!verified.accessAllInns) {
      const { rows } = await pool.query<{ inn: string }>(
        "SELECT inn FROM account_companies WHERE login = $1",
        [String(login).trim().toLowerCase()]
      );
      rows.forEach((r) => {
        const v = r.inn?.trim();
        if (v) allowedInns.add(v);
      });
    }

    const toFetch = verified.accessAllInns
      ? inns
      : inns.filter((i) => allowedInns.has(i));

    if (toFetch.length === 0) {
      return res.status(200).json({ items: [] });
    }

    const { rows } = await pool.query<{ inn: string; days_of_week: number[]; work_start: string; work_end: string }>(
      "SELECT inn, COALESCE(days_of_week, ARRAY[1,2,3,4,5]::smallint[])::integer[] AS days_of_week, work_start::text, work_end::text FROM customer_work_schedule WHERE inn = ANY($1)",
      [toFetch]
    );

    const items = rows.map((r) => {
      const ws = String(r.work_start || "09:00").slice(0, 5);
      const we = String(r.work_end || "18:00").slice(0, 5);
      return {
        inn: r.inn,
        days_of_week: Array.isArray(r.days_of_week) ? r.days_of_week.filter((d) => d >= 1 && d <= 7) : [1, 2, 3, 4, 5],
        work_start: /^\d{1,2}:\d{2}$/.test(ws) ? ws : "09:00",
        work_end: /^\d{1,2}:\d{2}$/.test(we) ? we : "18:00",
      };
    });

    return res.status(200).json({ items });
  } catch (e: unknown) {
    if (String((e as Error)?.message || "").includes("customer_work_schedule")) {
      return res.status(200).json({ items: [] });
    }
    console.error("customer-work-schedules error:", e);
    return res.status(500).json({ error: (e as Error)?.message || "Ошибка загрузки" });
  }
}
