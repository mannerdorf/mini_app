import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { sendInnAccessEmail } from "../lib/sendInnAccessEmail.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function random6(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "request-inn-access");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  let body: { inn?: string; login?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }
  const inn = typeof body?.inn === "string" ? body.inn.replace(/\D/g, "").trim() : "";
  const login = typeof body?.login === "string" ? body.login.trim() : "";
  if (inn.length !== 10 && inn.length !== 12) {
    return res.status(400).json({ error: "ИНН должен содержать 10 или 12 цифр", request_id: ctx.requestId });
  }
  if (!login) {
    return res.status(400).json({ error: "Укажите логин", request_id: ctx.requestId });
  }
  const loginLower = login.toLowerCase();
  try {
    const pool = getPool();
    const customer = await pool.query<{ email: string | null; customer_name: string }>(
      "SELECT email, customer_name FROM cache_customers WHERE inn = $1",
      [inn]
    );
    const row = customer.rows[0];
    if (!row) {
      return res.status(404).json({ error: "Компания с таким ИНН не найдена в справочнике", request_id: ctx.requestId });
    }
    const email = row.email?.trim() || "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "У организации не указан email в справочнике. Обратитесь в поддержку.", request_id: ctx.requestId });
    }
    const code6 = random6();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      "INSERT INTO inn_access_requests (inn, requester_login, code_6, expires_at) VALUES ($1, $2, $3, $4)",
      [inn, loginLower, code6, expiresAt]
    );
    const sendResult = await sendInnAccessEmail(pool, email, loginLower, code6, row.customer_name || "");
    if (!sendResult.ok) {
      return res.status(500).json({ error: "Письмо не отправлено: " + (sendResult.error || "ошибка"), request_id: ctx.requestId });
    }
    return res.status(200).json({ ok: true, message: "Письмо с кодом отправлено на верифицированную почту организации", request_id: ctx.requestId });
  } catch (e: unknown) {
    logError(ctx, "request_inn_access_failed", e);
    return res.status(500).json({ error: (e as Error)?.message || "Ошибка запроса", request_id: ctx.requestId });
  }
}
