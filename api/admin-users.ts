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
    const normalizeLogin = (v: string) => String(v || "").trim().toLowerCase();
    const byLogin = new Map<string, { inn: string; name: string }[]>();
    for (const c of companies) {
      const key = normalizeLogin(c.login);
      if (!key) continue;
      if (!byLogin.has(key)) byLogin.set(key, []);
      byLogin.get(key)!.push({ inn: c.inn, name: c.name || "" });
    }
    const userLogins = users.map((u) => normalizeLogin(u.login)).filter(Boolean);
    const uniqueUserLogins = [...new Set(userLogins)];
    const byEmail = new Map<string, { inn: string; name: string }[]>();
    if (uniqueUserLogins.length > 0) {
      try {
        const { rows: customersByEmail } = await pool.query<{ inn: string; customer_name: string | null; email: string | null }>(
          `SELECT inn, customer_name, email
           FROM cache_customers
           WHERE email IS NOT NULL
             AND lower(trim(email)) = ANY($1::text[])`,
          [uniqueUserLogins]
        );
        for (const c of customersByEmail) {
          const emailKey = normalizeLogin(c.email || "");
          if (!emailKey) continue;
          if (!byEmail.has(emailKey)) byEmail.set(emailKey, []);
          byEmail.get(emailKey)!.push({ inn: c.inn, name: c.customer_name || "" });
        }
      } catch (e: unknown) {
        const pgErr = e as { code?: string; message?: string };
        if (pgErr?.code !== "42P01" && pgErr?.code !== "42703") {
          console.error("admin-users cache_customers by email query error:", pgErr?.message || e);
        }
      }
    }
    const usersWithCompanies = users.map((u) => {
      const key = normalizeLogin(u.login);
      const list = [...(byLogin.get(key) || []), ...(byEmail.get(key) || [])];
      // Дедуп по ИНН, чтобы не было дублей при смешанном регистре логинов.
      const unique = new Map<string, { inn: string; name: string }>();
      for (const c of list) {
        const inn = String(c.inn || "").trim();
        if (!inn) continue;
        if (!unique.has(inn)) unique.set(inn, { inn, name: c.name || "" });
      }
      // Если company из профиля пользователя отсутствует в account_companies — добавляем как fallback.
      const profileInn = String(u.inn || "").trim();
      if (profileInn && !unique.has(profileInn)) {
        unique.set(profileInn, { inn: profileInn, name: u.company_name || "" });
      }
      return {
        ...u,
        companies: [...unique.values()],
      };
    });
    return res.status(200).json({ users: usersWithCompanies, last_login_available: lastLoginAvailable });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-users error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки" });
  }
}
export default withErrorLog(handler);