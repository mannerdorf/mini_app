import type { VercelRequest } from "@vercel/node";
import type { Pool } from "pg";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";

export async function pgTableExists(pool: Pool, tableName: string): Promise<boolean> {
  const { rows } = await pool.query<{ reg: string | null }>(
    `select to_regclass($1) as reg`,
    [tableName],
  );
  return Boolean(rows[0]?.reg);
}

export function pickHaulzCredentials(req: VercelRequest, body?: unknown): { login: string; password: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const login = String(req.headers["x-login"] ?? b.login ?? "").trim();
  const password = String(req.headers["x-password"] ?? b.password ?? "").trim();
  return { login, password };
}

export type HaulzReturnsAccess = {
  login: string;
  loginKey: string;
};

export async function resolveHaulzReturnsAccess(
  req: VercelRequest,
  body?: unknown,
): Promise<HaulzReturnsAccess | null> {
  const { login, password } = pickHaulzCredentials(req, body);
  if (!login || !password) return null;
  const pool = getPool();
  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) return null;
  const loginKey = login.trim().toLowerCase();
  const { rows } = await pool.query<{ permissions: Record<string, boolean> | null }>(
    `select permissions from registered_users where lower(trim(login)) = $1 and active = true`,
    [loginKey],
  );
  const perms = rows[0]?.permissions;
  if (perms?.haulz !== true && perms?.red_returns !== true) return null;
  return { login, loginKey };
}

export async function assertReturnsJobAccess(pool: Pool, jobId: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: string }>(
    `select id::text from haulz_returns_jobs where id = $1`,
    [jobId],
  );
  return rows.length > 0;
}

/** @deprecated Используйте assertReturnsJobAccess — сессии общие для всех с доступом к возвратам. */
export async function assertJobOwner(pool: Pool, jobId: number, _loginKey: string): Promise<boolean> {
  return assertReturnsJobAccess(pool, jobId);
}

export function workbookFromDb(row: {
  sheets: unknown;
  itog_control_keys: unknown;
}): { sheets: unknown; itogControlKeys: Set<string> } {
  const sheets = Array.isArray(row.sheets) ? row.sheets : [];
  const keysRaw = row.itog_control_keys;
  const keys = Array.isArray(keysRaw) ? keysRaw.map(String) : [];
  return { sheets, itogControlKeys: new Set(keys) };
}
