import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool } from "pg";
import { getPool } from "../api/_db.js";
import { verifyPassword } from "./passwordUtils.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "./adminAuth.js";
import {
  buildWeeklySummaryData,
  getPreviousCalendarWeekRange,
  renderWeeklySummaryHtml,
  sendWeeklySummaryEmail,
} from "./weeklySummary.js";

export type HaulzSummarySandboxBody = {
  action?: string;
  login?: string;
  password?: string;
  targetLogin?: string;
  inn?: string;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function parseHaulzSummarySandboxBody(req: VercelRequest): HaulzSummarySandboxBody {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return (body && typeof body === "object" ? body : {}) as HaulzSummarySandboxBody;
}

export function isHaulzSummarySandboxAction(action: unknown): boolean {
  const a = String(action ?? "").trim().toLowerCase();
  return a === "users" || a === "preview" || a === "send";
}

function normalizeLogin(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type HaulzSummarySandboxAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function assertHaulzSummarySandboxAccess(
  req: VercelRequest,
  credentials: { login?: string; password?: string },
): Promise<HaulzSummarySandboxAuthResult> {
  if (verifyAdminToken(getAdminTokenFromRequest(req))) {
    return { ok: true };
  }
  const login = normalizeLogin(credentials.login);
  const password = String(credentials.password ?? "");
  if (!login || !password) {
    return { ok: false, status: 401, error: "Требуется авторизация админа или логин/пароль HAULZ" };
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      password_hash: string;
      active: boolean;
      permissions: Record<string, boolean> | null;
    }>(
      "SELECT password_hash, active, permissions FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1",
      [login],
    );
    const row = rows[0];
    if (!row?.active || !verifyPassword(password, row.password_hash)) {
      return { ok: false, status: 401, error: "Неверный логин или пароль" };
    }
    const perms = row.permissions && typeof row.permissions === "object" ? row.permissions : {};
    if (perms.haulz !== true || perms.service_mode !== true) {
      return { ok: false, status: 403, error: "Недостаточно прав (нужны HAULZ и служебный режим)" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: "Ошибка проверки доступа" };
  }
}

async function loadCustomersDirectory(pool: Pool): Promise<Array<{ inn: string; name: string; email: string }>> {
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

export async function loadHaulzSummaryDirectories(pool: Pool) {
  const [users, customers] = await Promise.all([loadUsersWithCompanies(pool), loadCustomersDirectory(pool)]);
  return { users, customers, defaultPeriod: getPreviousCalendarWeekRange() };
}

async function loadUsersWithCompanies(pool: Pool) {
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
      // cache_customers может отсутствовать
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

/** Песочница «Самери»: users / preview / send. */
export async function handleHaulzSummarySandboxRequest(
  req: VercelRequest,
  res: VercelResponse,
  requestId: string,
): Promise<boolean> {
  const body = parseHaulzSummarySandboxBody(req);
  if (!isHaulzSummarySandboxAction(body.action)) {
    return false;
  }

  const auth = await assertHaulzSummarySandboxAccess(req, {
    login: body.login,
    password: body.password,
  });
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error, request_id: requestId });
    return true;
  }

  const action = String(body.action).trim().toLowerCase();

  try {
    const pool = getPool();

    if (action === "users") {
      const { users, customers, defaultPeriod } = await loadHaulzSummaryDirectories(pool);
      res.status(200).json({ users, customers, defaultPeriod, request_id: requestId });
      return true;
    }

    const targetLogin = normalizeLogin(body.targetLogin);
    const inn = String(body.inn ?? "").trim();
    const companyName = String(body.companyName ?? "").trim();
    if (!targetLogin) {
      res.status(400).json({ error: "Укажите targetLogin", request_id: requestId });
      return true;
    }
    if (!inn) {
      res.status(400).json({ error: "Укажите inn контрагента", request_id: requestId });
      return true;
    }

    const defaultPeriod = getPreviousCalendarWeekRange();
    const dateFrom = ISO_DAY.test(String(body.dateFrom ?? "")) ? String(body.dateFrom) : defaultPeriod.dateFrom;
    const dateTo = ISO_DAY.test(String(body.dateTo ?? "")) ? String(body.dateTo) : defaultPeriod.dateTo;
    if (dateFrom > dateTo) {
      res.status(400).json({ error: "dateFrom не может быть больше dateTo", request_id: requestId });
      return true;
    }

    const data = await buildWeeklySummaryData(pool, {
      inn,
      companyName: companyName || inn,
      targetLogin,
      dateFrom,
      dateTo,
    });
    const html = renderWeeklySummaryHtml(data);
    const subject = `HAULZ: сводка за ${data.periodLabel}`;

    if (action === "preview") {
      res.status(200).json({ data, html, subject, request_id: requestId });
      return true;
    }

    if (action === "send") {
      const sendResult = await sendWeeklySummaryEmail(pool, targetLogin, subject, html);
      if (!sendResult.ok) {
        res.status(500).json({ error: sendResult.error || "Ошибка отправки", request_id: requestId });
        return true;
      }
      res.status(200).json({ ok: true, sentTo: targetLogin, subject, request_id: requestId });
      return true;
    }

    res.status(400).json({ error: "Неизвестный action (users | preview | send)", request_id: requestId });
    return true;
  } catch (e: unknown) {
    const err = e as Error;
    res.status(500).json({ error: err?.message || "Ошибка", request_id: requestId });
    return true;
  }
}
