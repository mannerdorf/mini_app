import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { verifyAppCredentials } from "../lib/verifyAppCredentials.js";
import {
  ensureLegalDocumentsSeeded,
  getCurrentLegalVersions,
  getLatestAcceptancesByLogin,
  needsLegalReacceptance,
} from "../lib/legalDocuments.js";

function pickCredentials(req: VercelRequest): { login: string; password: string } {
  const login = String(req.headers["x-login"] ?? req.query?.login ?? "").trim();
  const password = String(req.headers["x-password"] ?? req.query?.password ?? "").trim();
  return { login, password };
}

/** GET — статус принятия текущих редакций для пользователя. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "legal-status");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const { login, password } = pickCredentials(req);
  if (!login || !password) {
    return res.status(400).json({ error: "login и password обязательны (x-login, x-password)", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const ok = await verifyAppCredentials(pool, login, password);
    if (!ok) {
      return res.status(401).json({ error: "Неверный логин или пароль", request_id: ctx.requestId });
    }

    await ensureLegalDocumentsSeeded(pool);
    const loginKey = login.trim().toLowerCase();
    const current = await getCurrentLegalVersions(pool);
    const accepted = await getLatestAcceptancesByLogin(pool, loginKey);
    const pending = needsLegalReacceptance(current, accepted);

    return res.status(200).json({
      login: loginKey,
      current: {
        offer: current.offer
          ? { id: current.offer.id, version_label: current.offer.version_label, published_at: current.offer.published_at }
          : null,
        consent: current.consent
          ? { id: current.consent.id, version_label: current.consent.version_label, published_at: current.consent.published_at }
          : null,
      },
      accepted: {
        offer: accepted.offer
          ? {
              version_id: accepted.offer.version_id,
              version_label: accepted.offer.version_label,
              accepted_at: accepted.offer.accepted_at,
            }
          : null,
        consent: accepted.consent
          ? {
              version_id: accepted.consent.version_id,
              version_label: accepted.consent.version_label,
              accepted_at: accepted.consent.accepted_at,
            }
          : null,
      },
      pending,
      request_id: ctx.requestId,
    });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "legal_status_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка", request_id: ctx.requestId });
  }
}
