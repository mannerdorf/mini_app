import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";

type Body = {
  login?: string;
  password?: string;
  q?: string;
  limit?: number;
};

function parseBody(req: VercelRequest): Body {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return (body as Body) || {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const login = typeof body.login === "string" ? body.login.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!login || !password) return res.status(400).json({ error: "Укажите логин и пароль" });

  try {
    const pool = getPool();
    const userRes = await pool.query<{ password_hash: string; active: boolean }>(
      "SELECT password_hash, active FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1",
      [login]
    );
    const user = userRes.rows[0];
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const q = String(body.q ?? "").trim();
    const requestedLimit = Number(body.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(20, Math.min(10000, Math.trunc(requestedLimit)))
      : (q.length >= 2 ? 500 : 10000);

    if (q.length >= 2) {
      const pattern = `%${q.replace(/[%_]/g, "")}%`;
      const { rows } = await pool.query<{ inn: string; supplier_name: string; email: string }>(
        `SELECT inn, supplier_name, email
         FROM cache_suppliers
         WHERE inn ILIKE $1 OR supplier_name ILIKE $1 OR email ILIKE $1
         ORDER BY supplier_name
         LIMIT $2`,
        [pattern, limit]
      );
      return res.status(200).json({ suppliers: rows });
    }

    const { rows } = await pool.query<{ inn: string; supplier_name: string; email: string }>(
      `SELECT inn, supplier_name, email
       FROM cache_suppliers
       ORDER BY supplier_name
       LIMIT $1`,
      [limit]
    );
    return res.status(200).json({ suppliers: rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("expense-request-suppliers error:", message);
    return res.status(500).json({ error: "Ошибка загрузки поставщиков" });
  }
}
