import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

const normalizeLogin = (v: unknown) => String(v ?? "").trim().toLowerCase();
const normalizeInn = (v: unknown) => String(v ?? "").replace(/\D/g, "").trim();

/**
 * POST /api/order-create — создание новой заявки.
 * Требуется авторизация зарегистрированного пользователя.
 * Сохраняет заявку в pending_order_requests для последующей интеграции с 1С.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "order-create");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const login = normalizeLogin(body?.login ?? req.headers["x-login"]);
  const password = String(body?.password ?? req.headers["x-password"] ?? "").trim();
  const punktOtpravki = String(body?.punktOtpravki ?? "").trim();
  const punktNaznacheniya = String(body?.punktNaznacheniya ?? "").trim();
  const nomerZayavki = String(body?.nomerZayavki ?? "").trim();
  const dataZabora = String(body?.dataZabora ?? "").trim();
  const tableRows = Array.isArray(body?.tableRows) ? body.tableRows : [];

  if (!login || !password) {
    return res.status(400).json({ error: "login and password required", request_id: ctx.requestId });
  }
  if (!punktOtpravki || !punktNaznacheniya) {
    return res.status(400).json({ error: "Укажите пункт отправки и назначения", request_id: ctx.requestId });
  }
  if (!nomerZayavki) {
    return res.status(400).json({ error: "Укажите номер заявки", request_id: ctx.requestId });
  }
  if (!dataZabora) {
    return res.status(400).json({ error: "Укажите дату забора", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const verified = await verifyRegisteredUser(pool, login, password);
    if (!verified) {
      return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
    }

    await pool.query(
      `CREATE TABLE IF NOT EXISTS pending_order_requests (
        id SERIAL PRIMARY KEY,
        login TEXT NOT NULL,
        inn TEXT,
        punkt_otpravki TEXT NOT NULL,
        punkt_naznacheniya TEXT NOT NULL,
        nomer_zayavki TEXT NOT NULL,
        data_zabora DATE NOT NULL,
        table_rows JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    );

    const inn = verified.inn ? normalizeInn(verified.inn) : null;
    const dateVal = dataZabora.match(/^\d{4}-\d{2}-\d{2}$/) ? dataZabora : null;
    if (!dateVal) {
      return res.status(400).json({ error: "Неверный формат даты (YYYY-MM-DD)", request_id: ctx.requestId });
    }

    await pool.query(
      `INSERT INTO pending_order_requests (login, inn, punkt_otpravki, punkt_naznacheniya, nomer_zayavki, data_zabora, table_rows)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::jsonb)`,
      [login, inn, punktOtpravki, punktNaznacheniya, nomerZayavki, dateVal, JSON.stringify(tableRows)]
    );

    return res.status(200).json({ ok: true, message: "Заявка зарегистрирована", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "order_create_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка создания заявки",
      request_id: ctx.requestId,
    });
  }
}
