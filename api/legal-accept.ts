import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { verifyAppCredentials } from "../lib/verifyAppCredentials.js";
import {
  ensureLegalDocumentsSeeded,
  getCurrentLegalVersions,
  getRegisteredUserPermissions,
  hasServiceModePermission,
  recordLegalAcceptances,
  type LegalDocumentType,
} from "../lib/legalDocuments.js";

function pickCredentials(req: VercelRequest, body: Record<string, unknown>): { login: string; password: string } {
  const login = String(body?.login ?? req.headers["x-login"] ?? "").trim();
  const password = String(body?.password ?? req.headers["x-password"] ?? "").trim();
  return { login, password };
}

/** POST — зафиксировать принятие текущих (или указанных) редакций. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "legal-accept");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: Record<string, unknown> = (req.body as Record<string, unknown>) || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }

  const { login, password } = pickCredentials(req, body);
  if (!login || !password) {
    return res.status(400).json({ error: "login и password обязательны", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const ok = await verifyAppCredentials(pool, login, password);
    if (!ok) {
      return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
    }

    await ensureLegalDocumentsSeeded(pool);
    const current = await getCurrentLegalVersions(pool);

    const offerId = body.offer_version_id != null ? Number(body.offer_version_id) : current.offer?.id;
    const consentId = body.consent_version_id != null ? Number(body.consent_version_id) : current.consent?.id;

    const permissions = await getRegisteredUserPermissions(pool, login);
    if (hasServiceModePermission(permissions)) {
      return res.status(200).json({ ok: true, skipped: true, request_id: ctx.requestId });
    }

    const versionIds: Partial<Record<LegalDocumentType, number>> = {};
    if (Number.isFinite(offerId) && offerId > 0) versionIds.offer = offerId;
    if (Number.isFinite(consentId) && consentId > 0) versionIds.consent = consentId;

    const ip =
      (typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0]?.trim() : null) ||
      (typeof req.headers["x-real-ip"] === "string" ? req.headers["x-real-ip"] : null);
    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

    await recordLegalAcceptances(pool, login, versionIds, { ip: ip ?? undefined, userAgent: userAgent ?? undefined });

    return res.status(200).json({ ok: true, request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "legal_accept_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка", request_id: ctx.requestId });
  }
}
