import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";

type ByUserRow = {
  login: string;
  company_name: string | null;
  full_name: string | null;
  logins: number;
  ui_hits: number;
  ui_sections: Record<string, number>;
  expense_requests: number;
  claims: number;
  pending_orders: number;
  last_event_at: string | null;
};

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-user-activity-report");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token) || getAdminTokenPayload(token)?.superAdmin !== true) {
    return res.status(403).json({ error: "Доступ только для суперадминистратора", request_id: ctx.requestId });
  }

  const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return res.status(400).json({ error: "Укажите from в формате YYYY-MM-DD", request_id: ctx.requestId });
  }
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: "Укажите to в формате YYYY-MM-DD", request_id: ctx.requestId });
  }

  const fromTs = from;
  const toTs = `${to} 23:59:59.999`;

  try {
    const pool = getPool();

    const [aggRows, sectionRows, expenseRows, claimRows, orderRows, profileRows, recentRows] = await Promise.all([
      pool.query<{ login: string; logins: string; ui_hits: string; last_event_at: string | null }>(
        `SELECT lower(trim(login)) AS login,
                COUNT(*) FILTER (WHERE event_type = 'app_login')::text AS logins,
                COUNT(*) FILTER (WHERE event_type = 'ui_section')::text AS ui_hits,
                MAX(created_at) AS last_event_at
           FROM user_app_events
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          GROUP BY lower(trim(login))`,
        [fromTs, toTs]
      ),
      pool.query<{ login: string; section: string | null; cnt: string }>(
        `SELECT lower(trim(login)) AS login,
                NULLIF(trim(meta->>'section'), '') AS section,
                COUNT(*)::text AS cnt
           FROM user_app_events
          WHERE event_type = 'ui_section'
            AND created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          GROUP BY lower(trim(login)), NULLIF(trim(meta->>'section'), '')`,
        [fromTs, toTs]
      ),
      pool.query<{ login: string; cnt: string }>(
        `SELECT lower(trim(login)) AS login, COUNT(*)::text AS cnt
           FROM expense_requests
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          GROUP BY lower(trim(login))`,
        [fromTs, toTs]
      ),
      pool.query<{ login: string; cnt: string }>(
        `SELECT lower(trim(customer_login)) AS login, COUNT(*)::text AS cnt
           FROM claims
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          GROUP BY lower(trim(customer_login))`,
        [fromTs, toTs]
      ),
      pool.query<{ login: string; cnt: string }>(
        `SELECT lower(trim(login)) AS login, COUNT(*)::text AS cnt
           FROM pending_order_requests
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          GROUP BY lower(trim(login))`,
        [fromTs, toTs]
      ),
      pool.query<{ login: string; company_name: string | null; full_name: string | null }>(
        `SELECT lower(trim(login)) AS login, company_name, full_name FROM registered_users`
      ),
      pool.query<{ login: string; event_type: string; meta: Record<string, unknown> | null; created_at: string }>(
        `SELECT lower(trim(login)) AS login, event_type, meta, created_at
           FROM user_app_events
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          ORDER BY created_at DESC
          LIMIT 400`,
        [fromTs, toTs]
      ),
    ]);

    const profiles = new Map<string, { company_name: string | null; full_name: string | null }>();
    for (const r of profileRows.rows) {
      profiles.set(r.login, { company_name: r.company_name, full_name: r.full_name });
    }

    const sectionMap = new Map<string, Record<string, number>>();
    for (const r of sectionRows.rows) {
      const lg = r.login;
      if (!lg || !r.section) continue;
      const n = parseInt(r.cnt, 10) || 0;
      if (!sectionMap.has(lg)) sectionMap.set(lg, {});
      sectionMap.get(lg)![r.section] = n;
    }

    const numMap = (rows: typeof expenseRows.rows) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        m.set(r.login, parseInt(r.cnt, 10) || 0);
      }
      return m;
    };

    const expensesByLogin = numMap(expenseRows.rows);
    const claimsByLogin = numMap(claimRows.rows);
    const ordersByLogin = numMap(orderRows.rows);

    const loginSet = new Set<string>();
    for (const r of aggRows.rows) loginSet.add(r.login);
    for (const lg of expensesByLogin.keys()) loginSet.add(lg);
    for (const lg of claimsByLogin.keys()) loginSet.add(lg);
    for (const lg of ordersByLogin.keys()) loginSet.add(lg);

    const by_user: ByUserRow[] = [];
    let total_logins = 0;
    let total_ui_hits = 0;

    for (const lg of Array.from(loginSet).sort()) {
      const agg = aggRows.rows.find((x) => x.login === lg);
      const logins = agg ? parseInt(agg.logins, 10) || 0 : 0;
      const ui_hits = agg ? parseInt(agg.ui_hits, 10) || 0 : 0;
      total_logins += logins;
      total_ui_hits += ui_hits;
      const prof = profiles.get(lg);
      by_user.push({
        login: lg,
        company_name: prof?.company_name ?? null,
        full_name: prof?.full_name ?? null,
        logins,
        ui_hits,
        ui_sections: sectionMap.get(lg) || {},
        expense_requests: expensesByLogin.get(lg) || 0,
        claims: claimsByLogin.get(lg) || 0,
        pending_orders: ordersByLogin.get(lg) || 0,
        last_event_at: agg?.last_event_at ?? null,
      });
    }

    const summary = {
      distinct_users: by_user.length,
      total_logins,
      total_ui_opens: total_ui_hits,
      expense_requests_created: Array.from(expensesByLogin.values()).reduce((a, b) => a + b, 0),
      claims_created: Array.from(claimsByLogin.values()).reduce((a, b) => a + b, 0),
      pending_orders_created: Array.from(ordersByLogin.values()).reduce((a, b) => a + b, 0),
    };

    return res.status(200).json({
      period: { from: from, to: to },
      summary,
      by_user,
      recent_events: recentRows.rows,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    logError(ctx, "admin_user_activity_report_failed", e);
    const missing =
      err?.code === "42P01" ||
      (typeof err?.message === "string" && err.message.includes("user_app_events"));
    if (missing) {
      return res.status(503).json({
        error: "Таблица user_app_events отсутствует. Выполните миграцию 064_user_app_events.sql.",
        request_id: ctx.requestId,
      });
    }
    return res.status(500).json({ error: err?.message || "Ошибка отчёта", request_id: ctx.requestId });
  }
}

export default withErrorLog(handler);
