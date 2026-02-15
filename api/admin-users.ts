import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  try {
    const pool = getPool();
    const baseSelect = `SELECT id, login, inn, company_name, permissions, financial_access, COALESCE(access_all_inns, false) as access_all_inns, active, created_at`;
    type UserRow = {
      id: number;
      login: string;
      inn: string;
      company_name: string;
      permissions: Record<string, boolean>;
      financial_access: boolean;
      access_all_inns: boolean;
      active: boolean;
      created_at: string;
      last_login_at?: string | null;
    };
    let users: UserRow[];
    let lastLoginAvailable = true;
    try {
      const result = await pool.query<UserRow & { last_login_at: string | null }>(
        `${baseSelect}, last_login_at FROM registered_users ORDER BY created_at DESC`
      );
      users = result.rows;
    } catch (colErr: unknown) {
      const pgErr = colErr as { code?: string };
      if (pgErr?.code === "42703") {
        const result = await pool.query<UserRow>(`${baseSelect} FROM registered_users ORDER BY created_at DESC`);
        users = result.rows.map((u) => ({ ...u, last_login_at: null }));
        lastLoginAvailable = false;
      } else {
        throw colErr;
      }
    }
    const { rows: companies } = await pool.query<{ login: string; inn: string; name: string }>(
      `SELECT login, inn, name FROM account_companies ORDER BY login, name`
    );
    const byLogin = new Map<string, { inn: string; name: string }[]>();
    for (const c of companies) {
      if (!byLogin.has(c.login)) byLogin.set(c.login, []);
      byLogin.get(c.login)!.push({ inn: c.inn, name: c.name || "" });
    }
    const usersWithCompanies = users.map((u) => ({
      ...u,
      companies: byLogin.get(u.login) || [],
    }));
    return res.status(200).json({ users: usersWithCompanies, last_login_available: lastLoginAvailable });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-users error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}
export default withErrorLog(handler);