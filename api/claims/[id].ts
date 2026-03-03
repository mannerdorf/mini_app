import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { verifyRegisteredUser } from "../../lib/verifyRegisteredUser.js";
import { decodeBase64File, isClaimType, parseMoney } from "../../lib/claims.js";

type ClaimCreatePhoto = {
  fileName?: string;
  mimeType?: string;
  caption?: string;
  base64?: string;
};

type ClaimCreateDocument = {
  fileName?: string;
  mimeType?: string;
  docType?: "ttn" | "act" | "other";
  base64?: string;
};

type ClaimCreateVideoLink = {
  url?: string;
  title?: string;
};

function pickCredentials(req: VercelRequest, body: any): { login: string; password: string } {
  const loginFromHeader = typeof req.headers["x-login"] === "string" ? req.headers["x-login"] : "";
  const passwordFromHeader = typeof req.headers["x-password"] === "string" ? req.headers["x-password"] : "";
  const login = String(body?.login || loginFromHeader || "").trim();
  const password = String(body?.password || passwordFromHeader || "").trim();
  return { login, password };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const claimId = Number(req.query.id);
  if (!Number.isFinite(claimId) || claimId <= 0) return res.status(400).json({ error: "Некорректный id претензии" });

  const pool = getPool();
  const body = req.method === "POST" ? req.body : req.query;
  const { login, password } = pickCredentials(req, body);
  if (!login || !password) return res.status(400).json({ error: "login and password are required" });

  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) return res.status(401).json({ error: "Неверный логин или пароль" });
  const loginKey = login.trim().toLowerCase();

  const claimRes = await pool.query<{
    id: number;
    claimNumber: string;
    customerLogin: string;
    customerInn: string;
    status: string;
  }>(
    `SELECT
       id,
       claim_number AS "claimNumber",
       customer_login AS "customerLogin",
       customer_inn AS "customerInn",
       status
     FROM claims
     WHERE id = $1`,
    [claimId]
  );
  const claim = claimRes.rows[0];
  if (!claim) return res.status(404).json({ error: "Претензия не найдена" });

  const hasInnAccess = verified.accessAllInns || (!!verified.inn && claim.customerInn === verified.inn);
  const hasAccess = claim.customerLogin === loginKey || hasInnAccess;
  if (!hasAccess) return res.status(403).json({ error: "Нет доступа к этой претензии" });

  if (req.method === "GET") {
    const fullRes = await pool.query(
      `SELECT
         id,
         claim_number AS "claimNumber",
         customer_login AS "customerLogin",
         customer_company_name AS "customerCompanyName",
         customer_inn AS "customerInn",
         customer_phone AS "customerPhone",
         customer_email AS "customerEmail",
         cargo_number AS "cargoNumber",
         claim_type AS "claimType",
         description,
         requested_amount AS "requestedAmount",
         approved_amount AS "approvedAmount",
         status,
         status_changed_at AS "statusChangedAt",
         sla_due_at AS "slaDueAt",
         manager_login AS "managerLogin",
         expert_login AS "expertLogin",
         leader_login AS "leaderLogin",
         accountant_login AS "accountantLogin",
         manager_note AS "managerNote",
         leader_comment AS "leaderComment",
         accounting_note AS "accountingNote",
         customer_resolution AS "customerResolution",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM claims
       WHERE id = $1`,
      [claimId]
    );
    const detail = fullRes.rows[0];

    const [photos, documents, videoLinks, comments, events] = await Promise.all([
      pool.query(
        `SELECT id, file_name AS "fileName", mime_type AS "mimeType", caption,
                encode(file_bytes, 'base64') AS "base64", created_at AS "createdAt"
         FROM claim_photos
         WHERE claim_id = $1
         ORDER BY id ASC`,
        [claimId]
      ),
      pool.query(
        `SELECT id, file_name AS "fileName", mime_type AS "mimeType", doc_type AS "docType",
                encode(file_bytes, 'base64') AS "base64", created_at AS "createdAt"
         FROM claim_documents
         WHERE claim_id = $1
         ORDER BY id ASC`,
        [claimId]
      ),
      pool.query(
        `SELECT id, url, title, created_at AS "createdAt"
         FROM claim_video_links
         WHERE claim_id = $1
         ORDER BY id ASC`,
        [claimId]
      ),
      pool.query(
        `SELECT id, author_login AS "authorLogin", author_role AS "authorRole", comment_text AS "commentText",
                is_internal AS "isInternal", created_at AS "createdAt"
         FROM claim_comments
         WHERE claim_id = $1
           AND (is_internal = false OR $2 = true)
         ORDER BY id ASC`,
        [claimId, false]
      ),
      pool.query(
        `SELECT id, actor_login AS "actorLogin", actor_role AS "actorRole", event_type AS "eventType",
                from_status AS "fromStatus", to_status AS "toStatus", payload,
                created_at AS "createdAt"
         FROM claim_events
         WHERE claim_id = $1
         ORDER BY id ASC`,
        [claimId]
      ),
    ]);

    return res.json({
      claim: detail,
      photos: photos.rows,
      documents: documents.rows,
      videoLinks: videoLinks.rows,
      comments: comments.rows,
      events: events.rows,
    });
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const action = String(payload?.action || "").trim();
  if (!action) return res.status(400).json({ error: "action is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (action === "comment") {
      const commentText = String(payload?.commentText || "").trim();
      if (!commentText) throw new Error("Текст комментария пуст");
      await client.query(
        `INSERT INTO claim_comments (claim_id, author_login, author_role, comment_text, is_internal)
         VALUES ($1,$2,'client',$3,false)`,
        [claimId, loginKey, commentText]
      );
      await client.query(
        `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, payload)
         VALUES ($1,$2,'client','comment_added',$3::jsonb)`,
        [claimId, loginKey, JSON.stringify({ commentText })]
      );
    } else if (action === "customer_resolution") {
      const resolution = String(payload?.resolution || "").trim();
      if (resolution !== "agree" && resolution !== "disagree") throw new Error("resolution must be agree or disagree");
      const current = await client.query<{ status: string }>("SELECT status FROM claims WHERE id = $1", [claimId]);
      const status = current.rows[0]?.status || "";
      if (!["approved", "rejected", "closed"].includes(status)) {
        throw new Error("Подтверждение решения доступно после вынесения решения");
      }
      await client.query(
        `UPDATE claims
         SET customer_resolution = $2
         WHERE id = $1`,
        [claimId, resolution]
      );
      await client.query(
        `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, payload)
         VALUES ($1,$2,'client','customer_resolution',$3::jsonb)`,
        [claimId, loginKey, JSON.stringify({ resolution })]
      );
    } else if (action === "upload_documents") {
      const photos = Array.isArray(payload?.photos) ? payload.photos : [];
      const documents = Array.isArray(payload?.documents) ? payload.documents : [];
      const videoLinks = Array.isArray(payload?.videoLinks) ? payload.videoLinks : [];
      if (photos.length > 10) throw new Error("Можно прикрепить не более 10 фото за один запрос");

      for (const p of photos) {
        const fileName = String(p?.fileName || "photo").trim();
        const mimeType = String(p?.mimeType || "image/jpeg").trim();
        const caption = String(p?.caption || "").trim();
        const base64 = String(p?.base64 || "").trim();
        if (!base64) continue;
        const bytes = decodeBase64File(base64);
        if (bytes.length > 5 * 1024 * 1024) throw new Error("Фото превышает лимит 5MB");
        await client.query(
          `INSERT INTO claim_photos (claim_id, file_name, mime_type, caption, file_bytes)
           VALUES ($1,$2,$3,$4,$5)`,
          [claimId, fileName, mimeType, caption, bytes]
        );
      }
      for (const d of documents) {
        const fileName = String(d?.fileName || "document.pdf").trim();
        const mimeType = String(d?.mimeType || "application/pdf").trim();
        const docType = d?.docType === "ttn" || d?.docType === "act" ? d.docType : "other";
        const base64 = String(d?.base64 || "").trim();
        if (!base64) continue;
        const bytes = decodeBase64File(base64);
        if (bytes.length > 5 * 1024 * 1024) throw new Error("Документ превышает лимит 5MB");
        await client.query(
          `INSERT INTO claim_documents (claim_id, file_name, mime_type, doc_type, file_bytes)
           VALUES ($1,$2,$3,$4,$5)`,
          [claimId, fileName, mimeType, docType, bytes]
        );
      }
      for (const v of videoLinks) {
        const url = String(v?.url || "").trim();
        const title = String(v?.title || "").trim();
        if (!url) continue;
        await client.query(
          `INSERT INTO claim_video_links (claim_id, url, title)
           VALUES ($1,$2,$3)`,
          [claimId, url, title]
        );
      }

      await client.query(
        `UPDATE claims
         SET status = 'under_review',
             status_changed_at = now()
         WHERE id = $1
           AND status = 'waiting_docs'`,
        [claimId]
      );
      await client.query(
        `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, payload)
         VALUES ($1,$2,'client','documents_uploaded',$3::jsonb)`,
        [claimId, loginKey, JSON.stringify({ photos: photos.length, documents: documents.length, videoLinks: videoLinks.length })]
      );
    } else if (action === "submit") {
      const current = await client.query<{ status: string }>("SELECT status FROM claims WHERE id = $1 FOR UPDATE", [claimId]);
      const status = String(current.rows[0]?.status || "");
      if (status !== "draft") throw new Error("Отправить можно только претензию в статусе Черновик");

      await client.query(
        `UPDATE claims
         SET status = 'new',
             status_changed_at = now()
         WHERE id = $1`,
        [claimId]
      );
      await client.query(
        `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, from_status, to_status)
         VALUES ($1,$2,'client','claim_submitted','draft','new')`,
        [claimId, loginKey]
      );
    } else if (action === "withdraw") {
      const current = await client.query<{ status: string }>("SELECT status FROM claims WHERE id = $1 FOR UPDATE", [claimId]);
      const status = String(current.rows[0]?.status || "");
      const allowed = new Set(["new", "under_review", "waiting_docs", "in_progress", "awaiting_leader", "sent_to_accounting"]);
      if (!allowed.has(status)) throw new Error("Отозвать можно только отправленную претензию до финального решения");

      await client.query(
        `UPDATE claims
         SET status = 'draft',
             status_changed_at = now()
         WHERE id = $1`,
        [claimId]
      );
      await client.query(
        `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, from_status, to_status)
         VALUES ($1,$2,'client','claim_withdrawn',$3,'draft')`,
        [claimId, loginKey, status]
      );
    } else if (action === "update_draft") {
      const current = await client.query<{ status: string }>("SELECT status FROM claims WHERE id = $1 FOR UPDATE", [claimId]);
      const status = String(current.rows[0]?.status || "");
      if (status !== "draft") throw new Error("Редактирование доступно только для черновика");

      const cargoNumber = String(payload?.cargoNumber || "").trim();
      const claimTypeRaw = String(payload?.claimType || "").trim();
      const description = String(payload?.description || "").trim();
      const requestedAmount = parseMoney(payload?.requestedAmount);
      const customerPhone = String(payload?.customerPhone || "").trim();
      const customerEmail = String(payload?.customerEmail || "").trim();
      const customerContactName = String(payload?.customerContactName || "").trim();
      const photos = (Array.isArray(payload?.photos) ? payload.photos : []) as ClaimCreatePhoto[];
      const documents = (Array.isArray(payload?.documents) ? payload.documents : []) as ClaimCreateDocument[];
      const videoLinks = (Array.isArray(payload?.videoLinks) ? payload.videoLinks : []) as ClaimCreateVideoLink[];
      const selectedPlaces = Array.isArray(payload?.selectedPlaces) ? payload.selectedPlaces : [];
      const manipulationSigns = Array.isArray(payload?.manipulationSigns) ? payload.manipulationSigns : [];
      const packagingTypes = Array.isArray(payload?.packagingTypes) ? payload.packagingTypes : [];

      if (!cargoNumber) throw new Error("Укажите номер перевозки");
      if (!isClaimType(claimTypeRaw)) throw new Error("Неверный тип претензии");
      if (!description) throw new Error("Укажите описание претензии");
      if (requestedAmount == null || requestedAmount < 0) throw new Error("Некорректная сумма требования");
      if (photos.length > 10) throw new Error("Можно прикрепить не более 10 фото");

      await client.query(
        `UPDATE claims
         SET cargo_number = $2,
             claim_type = $3,
             description = $4,
             requested_amount = $5,
             customer_phone = $6,
             customer_email = $7
         WHERE id = $1`,
        [claimId, cargoNumber, claimTypeRaw, description, requestedAmount, customerPhone, customerEmail]
      );

      for (const p of photos) {
        const fileName = String(p?.fileName || "photo").trim();
        const mimeType = String(p?.mimeType || "image/jpeg").trim();
        const caption = String(p?.caption || "").trim();
        const base64 = String(p?.base64 || "").trim();
        if (!base64) continue;
        const bytes = decodeBase64File(base64);
        if (bytes.length > 5 * 1024 * 1024) throw new Error("Фото превышает лимит 5MB");
        await client.query(
          `INSERT INTO claim_photos (claim_id, file_name, mime_type, caption, file_bytes)
           VALUES ($1,$2,$3,$4,$5)`,
          [claimId, fileName, mimeType, caption, bytes]
        );
      }
      for (const d of documents) {
        const fileName = String(d?.fileName || "document.pdf").trim();
        const mimeType = String(d?.mimeType || "application/pdf").trim();
        const docType = d?.docType === "ttn" || d?.docType === "act" ? d.docType : "other";
        const base64 = String(d?.base64 || "").trim();
        if (!base64) continue;
        const bytes = decodeBase64File(base64);
        if (bytes.length > 5 * 1024 * 1024) throw new Error("Документ превышает лимит 5MB");
        await client.query(
          `INSERT INTO claim_documents (claim_id, file_name, mime_type, doc_type, file_bytes)
           VALUES ($1,$2,$3,$4,$5)`,
          [claimId, fileName, mimeType, docType, bytes]
        );
      }
      for (const v of videoLinks) {
        const url = String(v?.url || "").trim();
        const title = String(v?.title || "").trim();
        if (!url) continue;
        await client.query(
          `INSERT INTO claim_video_links (claim_id, url, title)
           VALUES ($1,$2,$3)`,
          [claimId, url, title]
        );
      }

      await client.query(
        `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, from_status, to_status, payload)
         VALUES ($1,$2,'client','claim_draft_saved','draft','draft',$3::jsonb)`,
        [claimId, loginKey, JSON.stringify({ cargoNumber, claimType: claimTypeRaw, requestedAmount, customerContactName, selectedPlaces, manipulationSigns, packagingTypes })]
      );
    } else {
      throw new Error("Неподдерживаемое действие");
    }

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: e?.message || "Ошибка обновления претензии" });
  } finally {
    client.release();
  }
}
