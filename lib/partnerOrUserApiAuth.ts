import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../api/_db.js";
import { getBearerPartnerToken } from "./partnerApi.js";
import { parseUserApiBearerToken, verifyUserApiKeySecretPart } from "./userApiKeyCrypto.js";
import { getRegisteredUserProfile, type VerifiedRegisteredUser } from "./verifyRegisteredUser.js";
import type { UserApiKeyScope } from "./userApiKeyScopes.js";
import { canonInnForApiKey } from "./userApiKeyInnFilter.js";

export type PartnerOrUserAuthResult =
  | {
      ok: true;
      login: string;
      verified: VerifiedRegisteredUser;
      keyId: string;
      /** Непустой — дополнительно ограничить строки по ИНН (цифры только). Пустой в БД — без доп. ограничения. */
      keyAllowedInnsCanon: string[] | null;
    }
  | { ok: false };

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status).json(body);
}

/**
 * Авторизация внешнего API v1 только персональным ключом `haulz_…` из профиля (таблица user_api_keys, scopes + ИНН).
 */
export async function resolvePartnerOrUserApiAuth(
  req: VercelRequest,
  res: VercelResponse,
  requestId: string,
  requiredScope: UserApiKeyScope,
): Promise<PartnerOrUserAuthResult> {
  const token = getBearerPartnerToken(req);
  if (!token) {
    sendJson(res, 401, {
      error: "Укажите Authorization: Bearer и полный ключ haulz_… из раздела Профиль → API",
      request_id: requestId,
    });
    return { ok: false };
  }

  const parsed = parseUserApiBearerToken(token);
  if (!parsed) {
    sendJson(res, 401, {
      error:
        "Неверный формат ключа. Нужен полный токен из профиля (один раз при создании): haulz_<id>_<секрет 64 hex>). Префикс haulz_…_ без секрета не подходит.",
      request_id: requestId,
    });
    return { ok: false };
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      id: string;
      user_login: string;
      secret_hash: string;
      scopes: string[];
      allowed_inns: string[];
    }>(
      `SELECT id, user_login, secret_hash, scopes, allowed_inns
       FROM user_api_keys
       WHERE public_id = $1 AND revoked_at IS NULL`,
      [parsed.publicId],
    );
    const r = rows[0];
    if (!r || !verifyUserApiKeySecretPart(parsed.secretPart, r.secret_hash)) {
      sendJson(res, 401, { error: "Неверный API-ключ", request_id: requestId });
      return { ok: false };
    }
    const scopes = Array.isArray(r.scopes) ? r.scopes.map((x) => String(x).trim()) : [];
    if (!scopes.includes(requiredScope)) {
      sendJson(res, 403, {
        error: `Недостаточно прав: нужен scope «${requiredScope}»`,
        request_id: requestId,
      });
      return { ok: false };
    }
    const loginKey = String(r.user_login).trim().toLowerCase();
    const verified = await getRegisteredUserProfile(pool, loginKey);
    if (!verified) {
      sendJson(res, 401, { error: "Пользователь не найден или неактивен", request_id: requestId });
      return { ok: false };
    }
    void pool.query(`UPDATE user_api_keys SET last_used_at = now() WHERE id = $1`, [r.id]).catch(() => {});
    const allow = Array.isArray(r.allowed_inns)
      ? r.allowed_inns.map((x) => canonInnForApiKey(String(x))).filter(Boolean)
      : [];
    return {
      ok: true,
      login: loginKey,
      verified,
      keyId: r.id,
      keyAllowedInnsCanon: allow.length > 0 ? allow : null,
    };
  } catch {
    sendJson(res, 500, { error: "Ошибка проверки API-ключа", request_id: requestId });
    return { ok: false };
  }
}
