import type { Pool } from "pg";
import { verifyPassword } from "./passwordUtils.js";

export type VerifiedRegisteredUser = {
  inn: string | null;
  accessAllInns: boolean;
};

/** Проверяет логин/пароль зарегистрированного пользователя. Возвращает данные или null при ошибке. */
export async function verifyRegisteredUser(
  pool: Pool,
  login: string,
  password: string
): Promise<VerifiedRegisteredUser | null> {
  const loginKey = String(login).trim().toLowerCase();
  if (!loginKey || !password) return null;

  const { rows } = await pool.query<{ inn: string; password_hash: string; access_all_inns: boolean }>(
    `SELECT inn, password_hash, COALESCE(access_all_inns, false) as access_all_inns
     FROM registered_users WHERE login = $1 AND active = true`,
    [loginKey]
  );

  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return {
    inn: row.inn?.trim() || null,
    accessAllInns: !!row.access_all_inns,
  };
}
