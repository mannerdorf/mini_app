import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { canonInnForApiKey } from "../lib/userApiKeyInnFilter.js";

type CompanyRef = { inn: string; name: string };

function parseCompaniesJson(raw: unknown): CompanyRef[] {
  if (!Array.isArray(raw)) return [];
  const out: CompanyRef[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const inn = canonInnForApiKey(String((row as { inn?: unknown }).inn ?? ""));
    const name = String((row as { name?: unknown }).name ?? "").trim();
    if (inn) out.push({ inn, name: name || inn });
  }
  return out;
}

function resolveKeyCompanies(args: {
  allowedInns: string[];
  profileInn: string | null;
  profileCompanyName: string | null;
  accessAllInns: boolean;
  accountCompanies: CompanyRef[];
}): CompanyRef[] {
  const byInn = new Map<string, CompanyRef>();
  for (const c of args.accountCompanies) byInn.set(c.inn, c);

  if (args.allowedInns.length > 0) {
    return args.allowedInns.map((inn) => {
      const c = byInn.get(inn);
      return c ?? { inn, name: inn };
    });
  }

  if (args.accountCompanies.length > 0) return args.accountCompanies;

  const profileInn = args.profileInn ? canonInnForApiKey(args.profileInn) : "";
  if (profileInn) {
    return [{ inn: profileInn, name: args.profileCompanyName?.trim() || profileInn }];
  }

  return [];
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-user-api-keys");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const limit = Math.min(500, Math.max(10, parseInt(String(req.query.limit || 200), 10) || 200));
  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "all";
  const status = ["all", "active", "disabled", "revoked"].includes(statusRaw) ? statusRaw : "all";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let idx = 1;

  if (status === "active") {
    conditions.push("k.revoked_at IS NULL AND k.disabled_at IS NULL");
  } else if (status === "disabled") {
    conditions.push("k.revoked_at IS NULL AND k.disabled_at IS NOT NULL");
  } else if (status === "revoked") {
    conditions.push("k.revoked_at IS NOT NULL");
  }

  if (q) {
    conditions.push(
      `(lower(trim(k.user_login)) ILIKE $${idx} OR k.label ILIKE $${idx} OR k.public_id ILIKE $${idx})`,
    );
    params.push(`%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`);
    idx += 1;
  }

  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  try {
    const pool = getPool();
    const [listRes, summaryRes] = await Promise.all([
      pool.query<{
        id: string;
        user_login: string;
        label: string;
        public_id: string;
        scopes: string[];
        allowed_inns: string[];
        created_at: string;
        revoked_at: string | null;
        last_used_at: string | null;
        disabled_at: string | null;
        company_name: string | null;
        full_name: string | null;
        profile_inn: string | null;
        access_all_inns: boolean;
        account_companies_json: unknown;
      }>(
        `SELECT k.id, k.user_login, k.label, k.public_id, k.scopes, k.allowed_inns,
                k.created_at, k.revoked_at, k.last_used_at, k.disabled_at,
                ru.company_name, ru.full_name, ru.inn AS profile_inn,
                COALESCE(ru.access_all_inns, false) AS access_all_inns,
                (
                  SELECT COALESCE(
                    json_agg(json_build_object('inn', ac.inn, 'name', ac.name) ORDER BY ac.name),
                    '[]'::json
                  )
                  FROM account_companies ac
                  WHERE lower(trim(ac.login)) = lower(trim(k.user_login))
                ) AS account_companies_json
         FROM user_api_keys k
         LEFT JOIN registered_users ru ON lower(trim(ru.login)) = lower(trim(k.user_login))
         ${where}
         ORDER BY COALESCE(k.last_used_at, k.created_at) DESC
         LIMIT $${idx}`,
        params,
      ),
      pool.query<{
        active: string;
        disabled: string;
        revoked: string;
        used_7d: string;
        never_used: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE revoked_at IS NULL AND disabled_at IS NULL)::text AS active,
           COUNT(*) FILTER (WHERE revoked_at IS NULL AND disabled_at IS NOT NULL)::text AS disabled,
           COUNT(*) FILTER (WHERE revoked_at IS NOT NULL)::text AS revoked,
           COUNT(*) FILTER (
             WHERE revoked_at IS NULL
               AND last_used_at IS NOT NULL
               AND last_used_at >= now() - interval '7 days'
           )::text AS used_7d,
           COUNT(*) FILTER (WHERE revoked_at IS NULL AND last_used_at IS NULL)::text AS never_used
         FROM user_api_keys`,
      ),
    ]);

    const summaryRow = summaryRes.rows[0];
    const keys = listRes.rows.map((r) => {
      const allowedInns = (r.allowed_inns || []).map((x) => canonInnForApiKey(String(x))).filter(Boolean);
      const accountCompanies = parseCompaniesJson(r.account_companies_json);
      const companies = resolveKeyCompanies({
        allowedInns,
        profileInn: r.profile_inn,
        profileCompanyName: r.company_name,
        accessAllInns: r.access_all_inns,
        accountCompanies,
      });
      const statusKey = r.revoked_at ? "revoked" : r.disabled_at ? "disabled" : "active";
      return {
        id: r.id,
        user_login: r.user_login,
        user_full_name: r.full_name,
        user_company_name: r.company_name,
        companies,
        companies_label: companies.map((c) => (c.name && c.name !== c.inn ? `${c.name} (${c.inn})` : c.inn)).join("; "),
        label: r.label,
        key_prefix: `haulz_${r.public_id}_`,
        key_hint: `haulz_${r.public_id.slice(0, 4)}…${r.public_id.slice(-4)}`,
        scopes: r.scopes || [],
        allowed_inns: allowedInns,
        created_at: r.created_at,
        revoked_at: r.revoked_at,
        disabled_at: r.disabled_at,
        last_used_at: r.last_used_at,
        enabled: !r.disabled_at && !r.revoked_at,
        status: statusKey,
      };
    });

    return res.status(200).json({
      keys,
      summary: {
        active: Number(summaryRow?.active || 0),
        disabled: Number(summaryRow?.disabled || 0),
        revoked: Number(summaryRow?.revoked || 0),
        used_last_7_days: Number(summaryRow?.used_7d || 0),
        never_used: Number(summaryRow?.never_used || 0),
      },
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    logError(ctx, "admin_user_api_keys_failed", e);
    return res.status(500).json({ error: "Не удалось загрузить журнал API-ключей", request_id: ctx.requestId });
  }
}

export default withErrorLog(handler);
