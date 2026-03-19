import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { getClientIp, isRateLimited, AUTH_LOGIN_LIMIT } from "../lib/rateLimit.js";
import { initRequestContext, logError } from "./_lib/observability.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "auth-registered-login");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const ip = getClientIp(req);
  if (isRateLimited("auth_login", ip, AUTH_LOGIN_LIMIT)) {
    return res.status(429).json({ error: "Слишком много попыток входа. Подождите минуту.", request_id: ctx.requestId });
  }

  let body: { email?: string; login?: string; password?: string } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }

  const emailRaw = typeof body?.email === "string" ? body.email : typeof body?.login === "string" ? body.login : "";
  const email = emailRaw.trim().toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return res.status(400).json({ error: "Введите email и пароль", request_id: ctx.requestId });
  }

  const adminLogin = process.env.ADMIN_LOGIN?.trim()?.toLowerCase() ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  const isAdminEnvCredentials =
    adminLogin !== "" &&
    adminPassword !== "" &&
    email === adminLogin &&
    password === adminPassword;

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
    if (isAdminEnvCredentials) {
      if (!user) {
        return res.status(401).json({
          error:
            "Этот логин и пароль подходят только для входа в админку. Для входа в приложение зарегистрируйте этот email в разделе «Пользователи» в админке.",
          request_id: ctx.requestId,
        });
      }
      // Вход по ADMIN_LOGIN/ADMIN_PASSWORD: используем пользователя из БД без проверки password_hash
    } else if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
    }

    try {
      await pool.query("UPDATE registered_users SET last_login_at = now() WHERE id = $1", [user.id]);
    } catch (updateErr: unknown) {
      const err = updateErr as { code?: string; message?: string };
      if (err?.code !== "42703" && !err?.message?.includes("last_login_at")) {
        throw updateErr;
      }
    }

    const permissions =
      user.permissions && typeof user.permissions === "object"
        ? user.permissions
        : {
            home: true,
            dashboard: true,
            cargo: true,
            doc_invoices: true,
            doc_acts: true,
            doc_orders: false,
            doc_sendings: false,
            doc_claims: false,
            doc_contracts: false,
            doc_acts_settlement: false,
            doc_tariffs: false,
            haulz: false,
            eor: false,
            wb: false,
            wb_admin: false,
            chat: true,
            service_mode: false,
            analytics: false,
            supervisor: false,
          };

    const accessAllInns = !!user.access_all_inns;
    let inCustomerDirectory = false;
    const userInn = user.inn?.trim();
    if (userInn) {
      const dirRow = await pool.query("SELECT 1 FROM cache_customers WHERE inn = $1 LIMIT 1", [userInn]);
      inCustomerDirectory = dirRow.rows.length > 0;
    }
    if (!inCustomerDirectory) {
      const { rows: acRows } = await pool.query<{ inn: string }>("SELECT inn FROM account_companies WHERE login = $1", [user.login]);
      for (const r of acRows) {
        if (r.inn?.trim()) {
          const d = await pool.query("SELECT 1 FROM cache_customers WHERE inn = $1 LIMIT 1", [r.inn.trim()]);
          if (d.rows.length > 0) {
            inCustomerDirectory = true;
            break;
          }
        }
      }
    }
    return res.status(200).json({
      ok: true,
      request_id: ctx.requestId,
      user: {
        login: user.login,
        inn: accessAllInns ? null : (user.inn?.trim() || null),
        companyName: user.company_name,
        permissions,
        financialAccess: !!user.financial_access,
        accessAllInns,
        inCustomerDirectory,
      },
    });
  } catch (e) {
    logError(ctx, "auth_registered_login_failed", e);
    return res.status(500).json({ error: "Ошибка входа", request_id: ctx.requestId });
  }
}
export default withErrorLog(handler);