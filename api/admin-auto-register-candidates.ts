import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { generatePassword, hashPassword } from "../lib/passwordUtils.js";
import { sendRegistrationEmail } from "../lib/sendRegistrationEmail.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";

const DEFAULT_PERMISSIONS = {
  cms_access: false,
  cargo: true,
  doc_invoices: true,
  doc_acts: true,
  doc_orders: false,
  doc_claims: false,
  doc_contracts: false,
  doc_acts_settlement: false,
  doc_tariffs: false,
  chat: true,
  service_mode: false,
  analytics: false,
  supervisor: false,
};

type Candidate = {
  inn: string;
  customer_name: string;
  email: string;
};

function normalizeEmail(v: string): string {
  return String(v || "").trim().toLowerCase();
}

function isValidEmail(v: string): boolean {
  const s = normalizeEmail(v);
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function collectCandidates(q?: string): Promise<{
  candidates: Candidate[];
  stats: { total: number; withEmail: number; validEmail: number; alreadyRegistered: number };
}> {
  const pool = getPool();
  const search = String(q || "").trim();
  const queryRows = search.length >= 2
    ? await pool.query<{ inn: string; customer_name: string; email: string }>(
        `select inn, customer_name, email
         from cache_customers
         where inn ilike $1 or customer_name ilike $1 or email ilike $1
         order by customer_name
         limit 5000`,
        [`%${search.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`]
      )
    : await pool.query<{ inn: string; customer_name: string; email: string }>(
        `select inn, customer_name, email
         from cache_customers
         order by customer_name
         limit 5000`
      );

  const raw = queryRows.rows || [];
  const total = raw.length;
  const withEmailRows = raw.filter((r) => normalizeEmail(r.email) !== "");
  const withEmail = withEmailRows.length;
  const validRows = withEmailRows.filter((r) => isValidEmail(r.email));
  const validEmail = validRows.length;

  const users = await pool.query<{ login: string }>("select login from registered_users where coalesce(trim(login), '') <> ''");
  const existingLogins = new Set(users.rows.map((r) => normalizeEmail(r.login)).filter(Boolean));

  const uniq = new Map<string, Candidate>();
  let alreadyRegistered = 0;
  for (const row of validRows) {
    const email = normalizeEmail(row.email);
    if (existingLogins.has(email)) {
      alreadyRegistered += 1;
      continue;
    }
    const inn = String(row.inn || "").trim();
    const customerName = String(row.customer_name || "").trim();
    const key = `${email}|${inn}`;
    if (!uniq.has(key)) {
      uniq.set(key, { inn, customer_name: customerName, email });
    }
  }

  return {
    candidates: Array.from(uniq.values()),
    stats: { total, withEmail, validEmail, alreadyRegistered },
  };
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  const autoModeEnabled = String(process.env.AUTO_REGISTER_FROM_CUSTOMERS || "").toLowerCase() === "true";

  if (req.method === "GET") {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const { candidates, stats } = await collectCandidates(q);
      return res.status(200).json({
        ok: true,
        auto_mode_enabled: autoModeEnabled,
        candidates,
        stats,
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ error: err?.message || "Ошибка dry-run кандидатов" });
    }
  }

  if (!autoModeEnabled) {
    return res.status(400).json({ error: "AUTO_REGISTER_FROM_CUSTOMERS=false. Включите переменную окружения для авто-режима." });
  }
  const payload = getAdminTokenPayload(getAdminTokenFromRequest(req));
  if (!payload?.superAdmin) {
    return res.status(403).json({ error: "Запуск авто-регистрации доступен только суперадминистратору" });
  }

  let body: { inns?: string[]; limit?: number } = req.body as any;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const { candidates } = await collectCandidates(q);
    const innFilter = new Set((Array.isArray(body?.inns) ? body.inns : []).map((x) => String(x || "").trim()).filter(Boolean));
    const limit = Math.max(1, Math.min(1000, Number(body?.limit) || candidates.length));
    const target = candidates
      .filter((c) => (innFilter.size ? innFilter.has(c.inn) : true))
      .slice(0, limit);

    const pool = getPool();
    let created = 0;
    let skipped = 0;
    let emailSent = 0;
    let emailFailed = 0;
    const errors: string[] = [];

    for (const c of target) {
      const login = normalizeEmail(c.email);
      try {
        const password = generatePassword(8);
        const passwordHash = hashPassword(password);
        const existing = await pool.query<{ id: number }>(
          "select id from registered_users where lower(trim(login)) = $1 limit 1",
          [login]
        );
        if (existing.rows.length > 0) {
          skipped += 1;
          continue;
        }

        const inserted = await pool.query<{ id: number }>(
          `insert into registered_users (login, password_hash, inn, company_name, permissions, financial_access, access_all_inns)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning id`,
          [login, passwordHash, c.inn, c.customer_name || "", JSON.stringify(DEFAULT_PERMISSIONS), true, false]
        );
        const userId = inserted.rows[0]?.id;
        if (!userId) {
          skipped += 1;
          continue;
        }

        await pool.query(
          `insert into account_companies (login, inn, name)
           values ($1, $2, $3)
           on conflict (login, inn) do update set name = excluded.name`,
          [login, c.inn, c.customer_name || ""]
        );

        created += 1;
        await writeAuditLog(pool, {
          action: "auto_user_register",
          target_type: "user",
          target_id: userId,
          details: { login, inn: c.inn, customer_name: c.customer_name },
        });

        const sendResult = await sendRegistrationEmail(pool, login, login, password, c.customer_name || "");
        if (sendResult.ok) {
          emailSent += 1;
          await writeAuditLog(pool, {
            action: "email_delivery_registration_sent",
            target_type: "user",
            target_id: userId,
            details: { login, email: login, source: "auto_register" },
          });
        } else {
          emailFailed += 1;
          await writeAuditLog(pool, {
            action: "email_delivery_registration_failed",
            target_type: "user",
            target_id: userId,
            details: { login, email: login, source: "auto_register", error: sendResult.error || "unknown_error" },
          });
        }
      } catch (e: any) {
        if (e?.code === "23505") {
          skipped += 1;
          continue;
        }
        errors.push(`${c.inn || c.email}: ${e?.message || "Ошибка"}`);
      }
    }

    return res.status(200).json({
      ok: true,
      auto_mode_enabled: autoModeEnabled,
      processed: target.length,
      created,
      skipped_existing: skipped,
      email_sent: emailSent,
      email_failed: emailFailed,
      errors: errors.slice(0, 20),
    });
  } catch (e: unknown) {
    const err = e as Error;
    return res.status(500).json({ error: err?.message || "Ошибка авто-регистрации" });
  }
}

export default withErrorLog(handler);
