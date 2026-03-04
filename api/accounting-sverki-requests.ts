/**
 * API заявок на формирование актов сверок для пользователей с доступом «Бухгалтерия».
 * Как в админке: список, пометка «Сформировано», удаление.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

function pickCredentials(req: VercelRequest): { login: string; password: string } {
  const login = String(req.headers["x-login"] ?? req.query?.login ?? "").trim();
  const password = String(req.headers["x-password"] ?? req.query?.password ?? "").trim();
  if (login && password) return { login, password };
  let body: any = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return {
    login: String(body?.login ?? "").trim(),
    password: String(body?.password ?? "").trim(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { login, password } = pickCredentials(req);
  if (!login || !password) {
    return res.status(400).json({ error: "login и password обязательны (x-login, x-password)" });
  }

  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }

  const { rows: userRows } = await pool.query<{ permissions: Record<string, boolean> }>(
    "SELECT permissions FROM registered_users WHERE LOWER(TRIM(login)) = $1 AND active = true",
    [login.trim().toLowerCase()]
  );
  const permissions = userRows[0]?.permissions;
  const hasAccounting = permissions && typeof permissions === "object" && permissions.accounting === true;
  if (!hasAccounting) {
    return res.status(403).json({ error: "Нет доступа к разделу Бухгалтерия" });
  }

  if (req.method === "GET") {
    try {
      const { rows } = await pool.query(
        `SELECT
           id,
           login,
           customer_inn AS "customerInn",
           contract,
           period_from AS "periodFrom",
           period_to AS "periodTo",
           status,
           created_at AS "createdAt",
           updated_at AS "updatedAt"
         FROM sverki_requests
         ORDER BY created_at DESC, id DESC
         LIMIT 500`
      );
      return res.json({ requests: rows });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Ошибка загрузки заявок актов сверки" });
    }
  }

  if (req.method === "POST") {
    let body: any = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const id = Number(body?.id ?? 0);
    const status = String(body?.status ?? "").trim();
    if (!Number.isFinite(id) || id <= 0 || status !== "edo_sent") {
      return res.status(400).json({ error: "Укажите id и status: edo_sent" });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE sverki_requests
         SET status = 'edo_sent', updated_at = now(), processed_at = now(), processed_by = $2
         WHERE id = $1
         RETURNING id`,
        [id, login]
      );
      if (!rows[0]) return res.status(404).json({ error: "Заявка не найдена" });
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Ошибка обновления" });
    }
  }

  if (req.method === "DELETE") {
    const id = Number((req.body as any)?.id ?? (req.query as any)?.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Укажите id" });
    }
    try {
      const result = await pool.query("DELETE FROM sverki_requests WHERE id = $1", [id]);
      if ((result.rowCount || 0) <= 0) return res.status(404).json({ error: "Заявка не найдена" });
      return res.json({ ok: true, deleted: true });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Ошибка удаления" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
