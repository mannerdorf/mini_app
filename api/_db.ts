import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __haulz_pg_pool: Pool | undefined;
}

export function getPool() {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!globalThis.__haulz_pg_pool) {
    try {
      const url = new URL(connectionString);
      url.searchParams.set("sslmode", "verify-full");
      connectionString = url.toString();
    } catch {
      // не URL (например, нестандартный формат) — используем как есть
    }
    globalThis.__haulz_pg_pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }

  return globalThis.__haulz_pg_pool;
}

