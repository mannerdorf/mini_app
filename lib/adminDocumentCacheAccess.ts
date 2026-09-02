import type { Pool } from "pg";
import { getAdminTokenFromRequest, getAdminTokenPayload, verifyAdminToken } from "./adminAuth.js";
import { getPerevozkiServiceCredentials } from "./cacheHistoryDays.js";
import {
  readDocumentsFromCacheByPeriod,
  type DocumentCacheReadOptions,
} from "./documentCacheRead.js";
import type { NormalizedDocumentKind } from "./documentCacheNormalized.js";

export type SuperAdminRequestContext = {
  adminToken: string;
  isSuperAdmin: boolean;
};

export function getSuperAdminRequestContext(
  req: { headers?: Record<string, string | string[] | undefined> },
  body: Record<string, unknown> | null | undefined,
): SuperAdminRequestContext {
  const adminToken =
    (typeof body?.adminToken === "string" ? body.adminToken.trim() : "") ||
    getAdminTokenFromRequest(req) ||
    "";
  const payload = verifyAdminToken(adminToken) ? getAdminTokenPayload(adminToken) : null;
  return {
    adminToken,
    isSuperAdmin: payload?.superAdmin === true,
  };
}

export function isVerifiedSuperAdmin(ctx: SuperAdminRequestContext): boolean {
  return Boolean(ctx.adminToken && verifyAdminToken(ctx.adminToken) && ctx.isSuperAdmin);
}

export async function readSuperAdminDocumentsFromCache(
  pool: Pool,
  kind: NormalizedDocumentKind,
  dateFrom: string,
  dateTo: string,
  options: DocumentCacheReadOptions = {},
): Promise<any[]> {
  const { items } = await readDocumentsFromCacheByPeriod(pool, kind, dateFrom, dateTo, options);
  return items;
}

/** CMS super-admin: сервисный аккаунт 1С, если login/password не переданы. */
export function resolveCredentialsForSuperAdmin(
  ctx: SuperAdminRequestContext,
  login: unknown,
  password: unknown,
): { login: string; password: string; serviceMode: true } | null {
  if (login && password) return null;
  if (!isVerifiedSuperAdmin(ctx)) return null;
  const serviceCreds = getPerevozkiServiceCredentials();
  if (!serviceCreds) return null;
  return { login: serviceCreds.login, password: serviceCreds.password, serviceMode: true };
}
