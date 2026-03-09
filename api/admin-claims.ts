import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { getPool } from "./_db.js";
import { initRequestContext } from "./_lib/observability.js";

function toPositiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-claims");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as any)?.admin) return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });

  const pool = getPool();
  const status = String(req.query.status || "").trim();
  const q = String(req.query.q || "").trim();
  const dateFrom = String(req.query.dateFrom || "").trim();
  const dateTo = String(req.query.dateTo || "").trim();
  const limit = Math.min(500, toPositiveInt(req.query.limit, 100));

  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    params.push(dateFrom);
    where.push(`c.created_at >= ($${params.length}::date)`);
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    params.push(dateTo);
    where.push(`c.created_at < ($${params.length}::date + interval '1 day')`);
  }
  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    where.push(`(c.claim_number ilike $${idx} or c.cargo_number ilike $${idx} or c.customer_company_name ilike $${idx})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  params.push(limit);

  const [claimsRes, kpiRes, chartRes] = await Promise.all([
    pool.query(
      `SELECT
         c.id,
         c.claim_number AS "claimNumber",
         c.customer_login AS "customerLogin",
         c.customer_company_name AS "customerCompanyName",
         c.customer_inn AS "customerInn",
         c.customer_phone AS "customerPhone",
         c.customer_email AS "customerEmail",
         c.cargo_number AS "cargoNumber",
         c.claim_type AS "claimType",
         c.description,
         c.requested_amount AS "requestedAmount",
         c.approved_amount AS "approvedAmount",
         c.status,
         c.status_changed_at AS "statusChangedAt",
         c.sla_due_at AS "slaDueAt",
         c.manager_login AS "managerLogin",
         c.expert_login AS "expertLogin",
         c.leader_login AS "leaderLogin",
         c.accountant_login AS "accountantLogin",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt",
         greatest(0, floor(extract(epoch from (now() - c.created_at)) / 86400))::int AS "daysInWork"
       FROM claims c
       ${whereSql}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $${params.length}`,
      params
    ),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE status NOT IN ('closed', 'paid', 'offset', 'rejected'))::int AS "activeCount",
         count(*) FILTER (WHERE status NOT IN ('closed', 'paid', 'offset', 'rejected') AND sla_due_at < now())::int AS "overdueCount",
         coalesce(sum(requested_amount), 0)::numeric(14,2) AS "requestedSum",
         coalesce(sum(approved_amount), 0)::numeric(14,2) AS "approvedSum"
       FROM claims`
    ),
    pool.query(
      `SELECT
         to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS "day",
         count(*)::int AS "count"
       FROM claims
       WHERE created_at >= now() - interval '30 days'
       GROUP BY 1
       ORDER BY 1`
    ),
  ]);

  return res.json({
    claims: claimsRes.rows,
    kpi: kpiRes.rows[0] || { activeCount: 0, overdueCount: 0, requestedSum: 0, approvedSum: 0 },
    chart: chartRes.rows,
    request_id: ctx.requestId,
  });
}
