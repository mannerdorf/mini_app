import type { Pool } from "pg";
import { getPreviousCalendarWeekRange } from "./weeklySummary.js";

function normalizeLogin(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export async function loadCustomersDirectory(pool: Pool): Promise<Array<{ inn: string; name: string; email: string }>> {
  try {
    const { rows } = await pool.query<{ inn: string; customer_name: string | null; email: string | null }>(
      `SELECT inn, customer_name, email FROM cache_customers ORDER BY customer_name NULLS LAST, inn`,
    );
    const unique = new Map<string, { inn: string; name: string; email: string }>();
    for (const r of rows) {
      const inn = String(r.inn || "").trim();
      if (!inn) continue;
      if (!unique.has(inn)) {
        unique.set(inn, {
          inn,
          name: String(r.customer_name || "").trim(),
          email: String(r.email || "").trim().toLowerCase(),
        });
      }
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export async function loadUsersWithCompanies(pool: Pool) {
  const baseSelect = `SELECT id, login, inn, company_name, permissions, financial_access, COALESCE(access_all_inns, false) as access_all_inns, active, created_at`;
  type UserRow = {
    id: number;
    login: string;
    inn: string;
    company_name: string;
    access_all_inns: boolean;
    active: boolean;
  };
  let users: UserRow[];
  try {
    const result = await pool.query<UserRow>(`${baseSelect} FROM registered_users WHERE active = true ORDER BY login`);
    users = result.rows;
  } catch {
    const result = await pool.query<UserRow>(`${baseSelect} FROM registered_users ORDER BY login`);
    users = result.rows.filter((u) => u.active);
  }

  const { rows: companies } = await pool.query<{ login: string; inn: string; name: string }>(
    `SELECT login, inn, name FROM account_companies ORDER BY login, name`,
  );
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
      const { rows: customersByEmail } = await pool.query<{
        inn: string;
        customer_name: string | null;
        email: string | null;
      }>(
        `SELECT inn, customer_name, email
         FROM cache_customers
         WHERE email IS NOT NULL
           AND lower(trim(email)) = ANY($1::text[])`,
        [uniqueUserLogins],
      );
      for (const c of customersByEmail) {
        const emailKey = normalizeLogin(c.email || "");
        if (!emailKey) continue;
        if (!byEmail.has(emailKey)) byEmail.set(emailKey, []);
        byEmail.get(emailKey)!.push({ inn: c.inn, name: c.customer_name || "" });
      }
    } catch {
      /* cache_customers может отсутствовать */
    }
  }

  return users.map((u) => {
    const key = normalizeLogin(u.login);
    const assignedCompanies = byLogin.get(key) || [];
    const list = assignedCompanies.length > 0 ? assignedCompanies : byEmail.get(key) || [];
    const unique = new Map<string, { inn: string; name: string }>();
    for (const c of list) {
      const inn = String(c.inn || "").trim();
      if (!inn) continue;
      if (!unique.has(inn)) unique.set(inn, { inn, name: c.name || "" });
    }
    const profileInn = String(u.inn || "").trim();
    if (profileInn && !unique.has(profileInn)) {
      unique.set(profileInn, { inn: profileInn, name: u.company_name || "" });
    }
    return {
      id: u.id,
      login: u.login,
      company_name: u.company_name,
      access_all_inns: !!u.access_all_inns,
      companies: [...unique.values()],
    };
  });
}

export async function loadHaulzSummaryDirectories(pool: Pool) {
  const [users, customers] = await Promise.all([loadUsersWithCompanies(pool), loadCustomersDirectory(pool)]);
  return { users, customers, defaultPeriod: getPreviousCalendarWeekRange() };
}
