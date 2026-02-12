import type { Pool } from "pg";
import { verifyPassword } from "./passwordUtils.js";

/** Проверяет логин/пароль зарегистрированного пользователя. Возвращает INN или null. */
export async function verifyRegisteredUser(
  pool: Pool,
  login: string,
  password: string
): Promise<string | null> {
  const loginKey = String(login).trim().toLowerCase();
  if (!loginKey || !password) return null;

  const { rows } = await pool.query<{ inn: string; password_hash: string }>(
    `SELECT inn, password_hash FROM registered_users WHERE login = $1 AND active = true`,
    [loginKey]
  );

  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return row.inn.trim() || null;
}
