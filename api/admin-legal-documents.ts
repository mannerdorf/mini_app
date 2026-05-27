import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { writeAuditLog } from "../lib/adminAuditLog.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import {
  ensureLegalDocumentsSeeded,
  getCurrentLegalVersions,
  publishLegalVersion,
  type LegalDocumentType,
} from "../lib/legalDocuments.js";

function parseBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** GET — версии и журнал принятий. POST — утвердить новую редакцию. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-legal-documents");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    await ensureLegalDocumentsSeeded(pool);

    if (req.method === "GET") {
      const documentType =
        typeof req.query.document_type === "string" && (req.query.document_type === "offer" || req.query.document_type === "consent")
          ? (req.query.document_type as LegalDocumentType)
          : null;
      const limit = Math.min(500, Math.max(10, parseInt(String(req.query.limit || 100), 10) || 100));
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

      const versionParams: unknown[] = [];
      let versionWhere = "";
      if (documentType) {
        versionParams.push(documentType);
        versionWhere = ` WHERE document_type = $1`;
      }
      const { rows: versions } = await pool.query(
        `SELECT id, document_type, version_label, published_at::text, is_current, created_at::text, created_by,
                length(body_text) AS body_length
         FROM legal_document_versions
         ${versionWhere}
         ORDER BY document_type, COALESCE(published_at, created_at) DESC, id DESC
         LIMIT 50`,
        versionParams
      );

      const journalConditions: string[] = [];
      const journalParams: unknown[] = [];
      let jIdx = 1;
      if (q) {
        journalConditions.push(
          `(a.login ILIKE $${jIdx} OR a.version_label ILIKE $${jIdx} OR COALESCE(r.company_name, '') ILIKE $${jIdx})`
        );
        journalParams.push("%" + q.replace(/%/g, "\\%").replace(/_/g, "\\_") + "%");
        jIdx += 1;
      }
      if (documentType) {
        journalConditions.push(`a.document_type = $${jIdx}`);
        journalParams.push(documentType);
        jIdx += 1;
      }
      const journalWhere = journalConditions.length ? ` WHERE ${journalConditions.join(" AND ")}` : "";
      journalParams.push(limit);

      const { rows: journal } = await pool.query(
        `SELECT a.id, a.login, a.document_type, a.version_id, a.version_label, a.accepted_at::text, a.ip,
                COALESCE(r.company_name, '') AS company_name
         FROM legal_acceptances a
         LEFT JOIN registered_users r ON lower(trim(r.login)) = lower(trim(a.login)) AND r.active = true
         ${journalWhere}
         ORDER BY a.accepted_at DESC
         LIMIT $${jIdx}`,
        journalParams
      );

      const current = await getCurrentLegalVersions(pool);

      const { rows: summary } = await pool.query<{
        login: string;
        company_name: string;
        offer_version_label: string | null;
        offer_accepted_at: string | null;
        consent_version_label: string | null;
        consent_accepted_at: string | null;
      }>(
        `SELECT lower(trim(a.login)) AS login,
                COALESCE(MAX(r.company_name), '') AS company_name,
                MAX(CASE WHEN a.document_type = 'offer' THEN a.version_label END) AS offer_version_label,
                MAX(CASE WHEN a.document_type = 'offer' THEN a.accepted_at::text END) AS offer_accepted_at,
                MAX(CASE WHEN a.document_type = 'consent' THEN a.version_label END) AS consent_version_label,
                MAX(CASE WHEN a.document_type = 'consent' THEN a.accepted_at::text END) AS consent_accepted_at
         FROM (
           SELECT DISTINCT ON (lower(trim(login)), document_type)
             login, document_type, version_label, accepted_at
           FROM legal_acceptances
           ORDER BY lower(trim(login)), document_type, accepted_at DESC
         ) a
         LEFT JOIN registered_users r ON lower(trim(r.login)) = lower(trim(a.login)) AND r.active = true
         GROUP BY lower(trim(a.login))
         ORDER BY MAX(a.accepted_at) DESC NULLS LAST
         LIMIT 300`
      );

      return res.status(200).json({
        current: {
          offer: current.offer
            ? { id: current.offer.id, version_label: current.offer.version_label, published_at: current.offer.published_at }
            : null,
          consent: current.consent
            ? { id: current.consent.id, version_label: current.consent.version_label, published_at: current.consent.published_at }
            : null,
        },
        versions,
        journal,
        summary,
        request_id: ctx.requestId,
      });
    }

    const body = parseBody(req);
    const documentType = body.document_type === "consent" ? "consent" : body.document_type === "offer" ? "offer" : null;
    const versionLabel = typeof body.version_label === "string" ? body.version_label.trim() : "";
    const bodyText = typeof body.body_text === "string" ? body.body_text : "";
    if (!documentType) {
      return res.status(400).json({ error: "Укажите document_type: offer или consent", request_id: ctx.requestId });
    }

    const adminLabel = getAdminTokenPayload(getAdminTokenFromRequest(req))?.superAdmin ? "superadmin" : "admin";
    const row = await publishLegalVersion(pool, documentType, versionLabel, bodyText, adminLabel);
    await writeAuditLog(pool, {
      action: "legal_version_publish",
      target_type: "legal_document",
      target_id: row.id,
      details: { document_type: documentType, version_label: row.version_label, admin: adminLabel },
    });

    return res.status(200).json({ ok: true, version: row, request_id: ctx.requestId });
  } catch (e: unknown) {
    const err = e as Error;
    logError(ctx, "admin_legal_documents_failed", err);
    return res.status(500).json({ error: err?.message || "Ошибка", request_id: ctx.requestId });
  }
}
