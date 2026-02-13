import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  try {
    const pool = getPool();
    const { rows: users } = await pool.query<{
      id: number;
      login: string;
      inn: string;
      company_name: string;
      permissions: Record<string, boolean>;
      financial_access: boolean;
      access_all_inns: boolean;
      active: boolean;
      created_at: string;
    }>(
      `SELECT id, login, inn, company_name, permissions, financial_access, COALESCE(access_all_inns, false) as access_all_inns, active, created_at
       FROM registered_users ORDER BY created_at DESC`
    );
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
    return res.status(200).json({ users: usersWithCompanies });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-users error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}
