import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  let body: { inn?: string; login?: string; code?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }
  const inn = typeof body?.inn === "string" ? body.inn.replace(/\D/g, "").trim() : "";
  const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : "";
  if (inn.length !== 10 && inn.length !== 12) {
    return res.status(400).json({ error: "Некорректный ИНН" });
  }
  if (!login || code.length !== 6) {
    return res.status(400).json({ error: "Укажите логин и код из 6 цифр" });
  }
  try {
    const pool = getPool();
    const requestRow = await pool.query<{ id: number }>(
      "SELECT id FROM inn_access_requests WHERE inn = $1 AND requester_login = $2 AND code_6 = $3 AND expires_at > now() ORDER BY created_at DESC LIMIT 1",
      [inn, login, code]
    );
    const reqRow = requestRow.rows[0];
    if (!reqRow) {
      return res.status(400).json({ error: "Неверный код или срок действия истёк" });
    }
    const requester = await pool.query<{ id: number; login: string }>(
      "SELECT id, login FROM registered_users WHERE LOWER(TRIM(login)) = $1 AND active = true",
      [login]
    );
    const requesterRow = requester.rows[0];
    if (!requesterRow) {
      return res.status(400).json({ error: "Добавление компании по ИНН доступно только зарегистрированным пользователям (вход по email и паролю)" });
    }
    const customerName = await pool.query<{ customer_name: string }>("SELECT customer_name FROM cache_customers WHERE inn = $1", [inn]);
    const name = customerName.rows[0]?.customer_name || inn;
    const managerRow = await pool.query<{ id: number }>(
      `SELECT ru.id FROM registered_users ru
       WHERE ru.active = true AND EXISTS (SELECT 1 FROM account_companies ac WHERE ac.login = ru.login AND ac.inn = $1)
       ORDER BY ru.invited_by_user_id NULLS FIRST, ru.id ASC LIMIT 1`,
      [inn]
    );
    const managerId = managerRow.rows[0]?.id ?? null;
    await pool.query(
      "INSERT INTO account_companies (login, inn, name) VALUES ($1, $2, $3) ON CONFLICT (login, inn) DO UPDATE SET name = EXCLUDED.name",
      [requesterRow.login, inn, name]
    );
    if (managerId != null && managerId !== requesterRow.id) {
      await pool.query(
        "UPDATE registered_users SET invited_by_user_id = $1, updated_at = now() WHERE id = $2",
        [managerId, requesterRow.id]
      );
    }
    await pool.query("DELETE FROM inn_access_requests WHERE id = $1", [reqRow.id]);
    return res.status(200).json({ ok: true, message: "Компания добавлена" });
  } catch (e: unknown) {
    console.error("verify-inn-code error:", e);
    return res.status(500).json({ error: (e as Error)?.message || "Ошибка подтверждения" });
  }
}
