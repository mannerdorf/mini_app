import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __haulz_pg_pool: Pool | undefined;
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!globalThis.__haulz_pg_pool) {
    globalThis.__haulz_pg_pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }

  return globalThis.__haulz_pg_pool;
}

