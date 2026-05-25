import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  buildWeeklySummaryData,
  getPreviousCalendarWeekRange,
  renderWeeklySummaryHtml,
  sendWeeklySummaryEmail,
} from "../lib/weeklySummary.js";

type Body = {
  action?: string;
  login?: string;
  password?: string;
  targetLogin?: string;
  inn?: string;
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
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
  return (body && typeof body === "object" ? body : {}) as Body;
}

function normalizeLogin(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

async function assertSandboxAuth(
  req: VercelRequest,
  body: Body,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (verifyAdminToken(getAdminTokenFromRequest(req))) {
    return { ok: true };
  }
  const login = normalizeLogin(body.login);
  const password = String(body.password ?? "");
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

async function loadUsersWithCompanies(pool: Awaited<ReturnType<typeof getPool>>) {
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
  return users.map((u) => {
    const key = normalizeLogin(u.login);
    const list = byLogin.get(key) || [];
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
      companies: [...unique.values()],
    };
  });
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-weekly-summary");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseBody(req);
  const auth = await assertSandboxAuth(req, body);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error, request_id: ctx.requestId });
  }

  const action = String(body.action ?? "preview").trim().toLowerCase();

  try {
    const pool = getPool();

    if (action === "users") {
      const users = await loadUsersWithCompanies(pool);
      const defaultPeriod = getPreviousCalendarWeekRange();
      return res.status(200).json({ users, defaultPeriod, request_id: ctx.requestId });
    }

    const targetLogin = normalizeLogin(body.targetLogin);
    const inn = String(body.inn ?? "").trim();
    const companyName = String(body.companyName ?? "").trim();
    if (!targetLogin) {
      return res.status(400).json({ error: "Укажите targetLogin", request_id: ctx.requestId });
    }
    if (!inn) {
      return res.status(400).json({ error: "Укажите inn контрагента", request_id: ctx.requestId });
    }

    const defaultPeriod = getPreviousCalendarWeekRange();
    const dateFrom = ISO_DAY.test(String(body.dateFrom ?? "")) ? String(body.dateFrom) : defaultPeriod.dateFrom;
    const dateTo = ISO_DAY.test(String(body.dateTo ?? "")) ? String(body.dateTo) : defaultPeriod.dateTo;
    if (dateFrom > dateTo) {
      return res.status(400).json({ error: "dateFrom не может быть больше dateTo", request_id: ctx.requestId });
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
      return res.status(200).json({ data, html, subject, request_id: ctx.requestId });
    }

    if (action === "send") {
      const sendResult = await sendWeeklySummaryEmail(pool, targetLogin, subject, html);
      if (!sendResult.ok) {
        return res.status(500).json({ error: sendResult.error || "Ошибка отправки", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, sentTo: targetLogin, subject, request_id: ctx.requestId });
    }

    return res.status(400).json({ error: "Неизвестный action (users | preview | send)", request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "admin_weekly_summary_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка", request_id: ctx.requestId });
  }
}

export default withErrorLog(handler);
