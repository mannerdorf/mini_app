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

    const { rows } = await pool.query<{ inn: string; days_to_pay: number }>(
      "SELECT inn, days_to_pay FROM payment_calendar WHERE inn = ANY($1)",
      [inns]
    );
    return res.status(200).json({ items: rows });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("my-payment-calendar error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}
