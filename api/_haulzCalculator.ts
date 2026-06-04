import type { VercelRequest } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { pickHaulzCredentials } from "./_haulzReturns.js";

export type HaulzCalculatorAccess = {
  login: string;
  loginKey: string;
};

/** Доступ к калькулятору: permissions.haulz (как у HAULZ возвратов). */
export async function resolveHaulzCalculatorAccess(
  req: VercelRequest,
  body?: unknown,
): Promise<HaulzCalculatorAccess | null> {
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
  if (perms?.haulz !== true) return null;
  return { login, loginKey };
}
