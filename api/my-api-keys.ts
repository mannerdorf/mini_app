import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyPassword } from "../lib/passwordUtils.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { generateUserApiKey } from "../lib/userApiKeyCrypto.js";
import { USER_API_KEY_SCOPES, normalizeScopes } from "../lib/userApiKeyScopes.js";
import { canonInnForApiKey } from "../lib/userApiKeyInnFilter.js";
import { getRegisteredUserProfile } from "../lib/verifyRegisteredUser.js";

type Body = {
  login?: string;
  password?: string;
  id?: string;
  label?: string;
  scopes?: unknown;
  allowed_inns?: unknown;
  enabled?: unknown;
};

function parseBody(req: VercelRequest): Body {
  let b = req.body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch {
      return {};
    }
  }
  return (b as Body) || {};
}

function readLoginPassword(req: VercelRequest, body: Body): { login: string; password: string } {
  const hLogin = String(req.headers["x-login"] ?? (req.headers as { "X-Login"?: string })["X-Login"] ?? "").trim();
  const hPass = String(req.headers["x-password"] ?? (req.headers as { "X-Password"?: string })["X-Password"] ?? "");
  const login = (typeof body.login === "string" ? body.login.trim() : "") || hLogin;
  const password = (typeof body.password === "string" ? body.password : "") || hPass;
  return { login, password };
}

async function verifyRegisteredLoginPassword(login: string, password: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM registered_users WHERE lower(trim(login)) = $1 AND active = true`,
    [login.trim().toLowerCase()],
  );
  const row = rows[0];
  return !!(row && verifyPassword(password, row.password_hash));
}

async function loadAssignableInnsCanon(pool: ReturnType<typeof getPool>, login: string): Promise<Set<string>> {
  const out = new Set<string>();
  const ac = await pool.query<{ inn: string }>(
    `SELECT inn FROM account_companies WHERE lower(trim(login)) = $1`,
    [login.trim().toLowerCase()],
  );
  for (const row of ac.rows) {
    const c = canonInnForApiKey(row.inn);
    if (c) out.add(c);
  }
  const self = await pool.query<{ inn: string | null }>(
    `SELECT inn FROM registered_users WHERE lower(trim(login)) = $1 AND active = true`,
    [login.trim().toLowerCase()],
  );
  const inn = self.rows[0]?.inn;
  const c = canonInnForApiKey(String(inn || ""));
  if (c) out.add(c);
  return out;
}

function parseAllowedInnsInput(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const c = canonInnForApiKey(String(x ?? ""));
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

async function resolveStoredAllowedInns(
  pool: ReturnType<typeof getPool>,
  loginKey: string,
  requestedInns: string[],
  res: VercelResponse,
  requestId: string,
): Promise<string[] | null> {
  const verified = await getRegisteredUserProfile(pool, loginKey);
  if (!verified) {
    res.status(403).json({ error: "Профиль пользователя недоступен", request_id: requestId });
    return null;
  }
  if (requestedInns.length === 0) return [];
  const assignable = await loadAssignableInnsCanon(pool, loginKey);
  if (verified.accessAllInns) return requestedInns;
  const bad = requestedInns.filter((inn) => !assignable.has(inn));
  if (bad.length > 0) {
    res.status(400).json({
      error: "Есть ИНН вне списка доступных компаний",
      invalid_inns: bad,
      request_id: requestId,
    });
    return null;
  }
  return requestedInns;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "my-api-keys");
  const body = parseBody(req);
  const { login, password } = readLoginPassword(req, body);

  if (!login || !password) {
    return res.status(400).json({ error: "Укажите login и password", request_id: ctx.requestId });
  }

  const okAuth = await verifyRegisteredLoginPassword(login, password);
  if (!okAuth) {
    return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
  }

  const pool = getPool();
  const loginKey = login.trim().toLowerCase();

  if (req.method === "GET") {
    try {
      const assignable = await loadAssignableInnsCanon(pool, loginKey);
      const { rows } = await pool.query<{
        id: string;
        label: string;
        public_id: string;
        scopes: string[];
        allowed_inns: string[];
        created_at: string;
        revoked_at: string | null;
        last_used_at: string | null;
        disabled_at: string | null;
      }>(
        `SELECT id, label, public_id, scopes, allowed_inns, created_at, revoked_at, last_used_at, disabled_at
         FROM user_api_keys
         WHERE lower(trim(user_login)) = $1 AND revoked_at IS NULL
         ORDER BY created_at DESC`,
        [loginKey],
      );
      return res.status(200).json({
        assignable_inns: Array.from(assignable).sort(),
        keys: rows.map((r) => ({
          id: r.id,
          label: r.label,
          /** Маска для списков (короткая). */
          key_hint: `haulz_${r.public_id.slice(0, 4)}…${r.public_id.slice(-4)}`,
          /** Префикс токена до секрета — можно копировать (секрет в БД не хранится в открытом виде). */
          key_prefix: `haulz_${r.public_id}_`,
          scopes: r.scopes || [],
          allowed_inns: (r.allowed_inns || []).map((x) => canonInnForApiKey(String(x))),
          created_at: r.created_at,
          revoked_at: r.revoked_at,
          last_used_at: r.last_used_at,
          disabled_at: r.disabled_at,
          enabled: !r.disabled_at,
        })),
        available_scopes: [...USER_API_KEY_SCOPES],
        request_id: ctx.requestId,
      });
    } catch (e) {
      logError(ctx, "my_api_keys_list_failed", e);
      return res.status(500).json({ error: "Не удалось загрузить ключи", request_id: ctx.requestId });
    }
  }

  if (req.method === "POST") {
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) : "";
    let scopes = normalizeScopes(body.scopes);
    if (scopes.length === 0) {
      scopes = [...USER_API_KEY_SCOPES];
    }
    const verified = await getRegisteredUserProfile(pool, loginKey);
    if (!verified) {
      return res.status(403).json({ error: "Профиль пользователя недоступен", request_id: ctx.requestId });
    }
    const requestedInns = parseAllowedInnsInput(body.allowed_inns);
    const storedAllowed = await resolveStoredAllowedInns(pool, loginKey, requestedInns, res, ctx.requestId);
    if (storedAllowed === null) return;
    const gen = generateUserApiKey();
    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO user_api_keys (user_login, label, public_id, secret_hash, scopes, allowed_inns)
         VALUES ($1, $2, $3, $4, $5::text[], $6::text[])
         RETURNING id`,
        [
          loginKey,
          label || "API key",
          gen.publicId,
          gen.secretHash,
          scopes,
          storedAllowed.length > 0 ? storedAllowed : [],
        ],
      );
      return res.status(201).json({
        id: rows[0]?.id,
        label: label || "API key",
        token: gen.fullToken,
        warning: "Сохраните токен сейчас — полное значение больше не будет показано.",
        scopes,
        allowed_inns: storedAllowed.length > 0 ? storedAllowed : null,
        request_id: ctx.requestId,
      });
    } catch (e) {
      logError(ctx, "my_api_keys_create_failed", e);
      return res.status(500).json({ error: "Не удалось создать ключ", request_id: ctx.requestId });
    }
  }

  if (req.method === "PATCH") {
    const idRaw = typeof body.id === "string" ? body.id.trim() : "";
    if (!idRaw) {
      return res.status(400).json({ error: "Укажите id ключа", request_id: ctx.requestId });
    }

    const sets: string[] = [];
    const params: unknown[] = [idRaw, loginKey];
    let paramIdx = 3;

    if (body.enabled !== undefined) {
      const enabled = body.enabled === true || body.enabled === "true" || body.enabled === 1;
      sets.push(enabled ? `disabled_at = NULL` : `disabled_at = now()`);
    }

    if (body.scopes !== undefined) {
      const scopes = normalizeScopes(body.scopes);
      if (scopes.length === 0) {
        return res.status(400).json({ error: "Выберите хотя бы один scope", request_id: ctx.requestId });
      }
      sets.push(`scopes = $${paramIdx}::text[]`);
      params.push(scopes);
      paramIdx += 1;
    }

    if (body.allowed_inns !== undefined) {
      const requestedInns = parseAllowedInnsInput(body.allowed_inns);
      const storedAllowed = await resolveStoredAllowedInns(pool, loginKey, requestedInns, res, ctx.requestId);
      if (storedAllowed === null) return;
      sets.push(`allowed_inns = $${paramIdx}::text[]`);
      params.push(storedAllowed);
      paramIdx += 1;
    }

    if (typeof body.label === "string" && body.label.trim()) {
      sets.push(`label = $${paramIdx}`);
      params.push(body.label.trim().slice(0, 200));
      paramIdx += 1;
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "Нечего обновлять (enabled, scopes, allowed_inns, label)", request_id: ctx.requestId });
    }

    try {
      const upd = await pool.query(
        `UPDATE user_api_keys SET ${sets.join(", ")}
         WHERE id = $1::uuid AND lower(trim(user_login)) = $2 AND revoked_at IS NULL
         RETURNING id, label, scopes, allowed_inns, disabled_at, last_used_at, public_id, created_at`,
        params,
      );
      const row = upd.rows[0] as {
        id: string;
        label: string;
        public_id: string;
        scopes: string[];
        allowed_inns: string[];
        disabled_at: string | null;
        last_used_at: string | null;
        created_at: string;
      } | undefined;
      if (!row) {
        return res.status(404).json({ error: "Ключ не найден или уже отозван", request_id: ctx.requestId });
      }
      return res.status(200).json({
        ok: true,
        key: {
          id: row.id,
          label: row.label,
          key_hint: `haulz_${row.public_id.slice(0, 4)}…${row.public_id.slice(-4)}`,
          key_prefix: `haulz_${row.public_id}_`,
          scopes: row.scopes || [],
          allowed_inns: (row.allowed_inns || []).map((x) => canonInnForApiKey(String(x))),
          created_at: row.created_at,
          last_used_at: row.last_used_at,
          disabled_at: row.disabled_at,
          enabled: !row.disabled_at,
        },
        request_id: ctx.requestId,
      });
    } catch (e) {
      logError(ctx, "my_api_keys_patch_failed", e);
      return res.status(500).json({ error: "Не удалось обновить ключ", request_id: ctx.requestId });
    }
  }

  if (req.method === "DELETE") {
    const q = req.query as { id?: string | string[] };
    const fromQuery = Array.isArray(q?.id) ? q.id[0] : q?.id;
    const idRaw =
      (typeof fromQuery === "string" ? fromQuery.trim() : "") ||
      (typeof body.id === "string" ? body.id.trim() : "");
    if (!idRaw) {
      return res.status(400).json({ error: "Укажите id ключа (query ?id=)", request_id: ctx.requestId });
    }
    try {
      const upd = await pool.query(
        `UPDATE user_api_keys SET revoked_at = now()
         WHERE id = $1::uuid AND lower(trim(user_login)) = $2 AND revoked_at IS NULL`,
        [idRaw, loginKey],
      );
      if (upd.rowCount === 0) {
        return res.status(404).json({ error: "Ключ не найден или уже отозван", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    } catch (e) {
      logError(ctx, "my_api_keys_revoke_failed", e);
      return res.status(500).json({ error: "Не удалось отозвать ключ", request_id: ctx.requestId });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
}
