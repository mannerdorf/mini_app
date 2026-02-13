import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: { email?: string; login?: string; password?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const emailRaw = typeof body?.email === "string" ? body.email : typeof body?.login === "string" ? body.login : "";
  const email = emailRaw.trim().toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return res.status(400).json({ error: "Введите email и пароль" });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      id: number;
      login: string;
      password_hash: string;
      inn: string;
      company_name: string;
      permissions: Record<string, boolean>;
      financial_access: boolean;
      access_all_inns: boolean;
    }>(
      `SELECT id, login, password_hash, inn, company_name, permissions, financial_access, COALESCE(access_all_inns, false) as access_all_inns
       FROM registered_users WHERE LOWER(TRIM(login)) = $1 AND active = true`,
      [email]
    );

    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Неверный email или пароль" });
    }

    await pool.query("UPDATE registered_users SET last_login_at = now() WHERE id = $1", [user.id]);

    const permissions =
      user.permissions && typeof user.permissions === "object"
        ? user.permissions
        : {
            cargo: true,
            doc_invoices: true,
            doc_acts: true,
            doc_orders: false,
            doc_claims: false,
            doc_contracts: false,
            doc_acts_settlement: false,
            doc_tariffs: false,
            chat: true,
          };

    const accessAllInns = !!user.access_all_inns;
    return res.status(200).json({
      ok: true,
      user: {
        login: user.login,
        inn: accessAllInns ? null : (user.inn?.trim() || null),
        companyName: user.company_name,
        permissions,
        financialAccess: !!user.financial_access,
        accessAllInns,
      },
    });
  } catch (e) {
    console.error("auth-registered-login error:", e);
    return res.status(500).json({ error: "Ошибка входа" });
  }
}
