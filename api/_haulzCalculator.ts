import type { VercelRequest } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { pickHaulzCredentials } from "./_haulzReturns.js";

export type HaulzCalculatorAccess = {
  login: string;
  loginKey: string;
};

/** Анонимный расчёт на гостевой главной (без сохранения черновиков и заявок). */
export const HAULZ_CALC_GUEST_LOGIN_KEY = "__guest__";

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

/** Авторизованный пользователь или гостевой расчёт (quote/options/адреса). */
export async function resolveHaulzCalculatorGuestQuoteAccess(
  req: VercelRequest,
  body?: unknown,
): Promise<HaulzCalculatorAccess | null> {
  const access = await resolveHaulzCalculatorAccess(req, body);
  if (access) return access;
  return { login: "", loginKey: HAULZ_CALC_GUEST_LOGIN_KEY };
}

/** Менеджер заявок калькулятора: haulz + (supervisor или cms_access). */
export async function resolveHaulzCalcManagerAccess(
  req: VercelRequest,
  body?: unknown,
): Promise<HaulzCalculatorAccess | null> {
  const access = await resolveHaulzCalculatorAccess(req, body);
  if (!access) return null;
  const pool = getPool();
  const { rows } = await pool.query<{ permissions: Record<string, boolean> | null }>(
    `select permissions from registered_users where lower(trim(login)) = $1 and active = true`,
    [access.loginKey],
  );
  const perms = rows[0]?.permissions;
  if (perms?.cms_access === true || perms?.supervisor === true) return access;
  return null;
}
