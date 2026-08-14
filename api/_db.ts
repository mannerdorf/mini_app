import { Pool, type PoolConfig } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __haulz_pg_pool: Pool | undefined;
}

function resolvePgSsl(connectionString: string): PoolConfig["ssl"] {
  const mode = String(process.env.PGSSLMODE || process.env.DATABASE_SSL || "").trim().toLowerCase();
  if (mode === "disable" || mode === "0" || mode === "false" || mode === "off") {
    return undefined;
  }
  if (mode === "require" || mode === "verify-full" || mode === "1" || mode === "true" || mode === "on") {
    return { rejectUnauthorized: false };
  }

  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return undefined;
    }
  } catch {
    // не URL — оставляем SSL по умолчанию для облачных хостов
  }

  return { rejectUnauthorized: false };
}

function normalizeConnectionString(connectionString: string, useSsl: boolean): string {
  if (!useSsl) return connectionString;
  try {
    const url = new URL(connectionString);
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function getPool() {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!globalThis.__haulz_pg_pool) {
    const ssl = resolvePgSsl(connectionString);
    connectionString = normalizeConnectionString(connectionString, ssl !== undefined);
    globalThis.__haulz_pg_pool = new Pool({
      connectionString,
      ssl,
      max: Number(process.env.PG_POOL_MAX || 12),
    });
  }

  return globalThis.__haulz_pg_pool;
}
