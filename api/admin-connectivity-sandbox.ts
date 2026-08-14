import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, verifyAdminToken } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";

function databaseHostHint(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const port = url.port ? `:${url.port}` : "";
    return `${url.hostname}${port}`;
  } catch {
    return "invalid-url";
  }
}

function connectivityHint(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const code = String(err?.code || "").trim();
  const message = String(err?.message || error || "").trim();

  if (message.includes("DATABASE_URL is not set")) {
    return "Задайте DATABASE_URL в Environment Variables (Production) и сделайте Redeploy.";
  }
  if (code === "ETIMEDOUT" || message.includes("ETIMEDOUT") || message.includes("timeout")) {
    return "Таймаут до Postgres. Часто Timeweb DB разрешает только IP VPS — Vercel подключается с других адресов.";
  }
  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "Соединение отклонено. Проверьте хост/порт DATABASE_URL и сетевой доступ в панели Timeweb.";
  }
  if (code === "28P01" || message.toLowerCase().includes("password authentication failed")) {
    return "Неверный пароль или пользователь в DATABASE_URL. URL-encode спецсимволы в пароле.";
  }
  if (code === "ENOTFOUND" || message.includes("ENOTFOUND")) {
    return "Хост БД не резолвится. Проверьте hostname в DATABASE_URL.";
  }
  if (message.includes("no pg_hba.conf entry")) {
    return "Postgres отклонил IP клиента (pg_hba). Откройте публичный доступ в Timeweb или используйте VPS API.";
  }
  return "Смотрите error/code ниже и логи Functions в Vercel.";
}

async function countRows(pool: import("pg").Pool, sql: string): Promise<number | null> {
  try {
    const { rows } = await pool.query<{ cnt: string }>(sql);
    return Number(rows[0]?.cnt ?? 0);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "42P01") return null;
    throw e;
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-connectivity-sandbox");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const connectionString = String(process.env.DATABASE_URL || "").trim();
  const databaseUrlConfigured = Boolean(connectionString);
  const pgSslMode = String(process.env.PGSSLMODE || process.env.DATABASE_SSL || "").trim() || "(auto)";

  const runtime = {
    nodeVersion: process.version,
    platform: process.env.VERCEL ? "vercel" : "node",
    vercelRegion: String(process.env.VERCEL_REGION || "").trim() || null,
    vercelEnv: String(process.env.VERCEL_ENV || "").trim() || null,
  };

  const env = {
    databaseUrlConfigured,
    databaseHost: databaseUrlConfigured ? databaseHostHint(connectionString) : "",
    pgSslMode,
    cronSecretConfigured: Boolean(String(process.env.CRON_SECRET || "").trim()),
    perevozkiConfigured: Boolean(
      String(process.env.PEREVOZKI_SERVICE_LOGIN || "").trim() &&
        String(process.env.PEREVOZKI_SERVICE_PASSWORD || "").trim(),
    ),
  };

  let database: {
    ok: boolean;
    latencyMs?: number;
    error?: string;
    errorCode?: string;
    hint?: string;
  } = { ok: false, hint: "DATABASE_URL не задан" };

  let samples: {
    accountCompanies: number | null;
    registeredUsers: number | null;
    cachePerevozkiRows: number | null;
    cachePerevozkiUpdatedAt: string | null;
    adminAuthConfigReadable: boolean;
  } = {
    accountCompanies: null,
    registeredUsers: null,
    cachePerevozkiRows: null,
    cachePerevozkiUpdatedAt: null,
    adminAuthConfigReadable: false,
  };

  if (databaseUrlConfigured) {
    const started = Date.now();
    try {
      const pool = getPool();
      await pool.query("SELECT 1 AS ok");
      database = { ok: true, latencyMs: Date.now() - started };

      const [accountCompanies, registeredUsers, cachePerevozkiRows] = await Promise.all([
        countRows(pool, "SELECT count(*)::text AS cnt FROM account_companies"),
        countRows(pool, "SELECT count(*)::text AS cnt FROM registered_users"),
        countRows(pool, "SELECT count(*)::text AS cnt FROM cache_perevozki_rows"),
      ]);
      samples.accountCompanies = accountCompanies;
      samples.registeredUsers = registeredUsers;
      samples.cachePerevozkiRows = cachePerevozkiRows;

      try {
        const updated = await pool.query<{ updated_at: string | null }>(
          "SELECT updated_at::text AS updated_at FROM cache_perevozki WHERE id = 1",
        );
        samples.cachePerevozkiUpdatedAt = updated.rows[0]?.updated_at ?? null;
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== "42P01") throw e;
      }

      try {
        await pool.query("SELECT api_v1, api_v2, cms FROM admin_auth_config WHERE id = 1");
        samples.adminAuthConfigReadable = true;
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err?.code !== "42P01") throw e;
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      logError(ctx, "admin_connectivity_db_failed", e);
      database = {
        ok: false,
        latencyMs: Date.now() - started,
        error: err?.message || String(e),
        errorCode: err?.code,
        hint: connectivityHint(e),
      };
    }
  }

  const ok = database.ok;
  return res.status(200).json({
    ok,
    runtime,
    env,
    database,
    samples,
    request_id: ctx.requestId,
  });
}

export default withErrorLog(handler);
