import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { decodeBase64File, isClaimType, parseMoney } from "../lib/claims.js";

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

type ClaimSelectedPlace = {
  placeNumber?: string | null;
  name?: string | null;
  sourceDoc?: string | null;
};

function pickCredentials(req: VercelRequest, body: any): { login: string; password: string } {
  const loginFromHeader = typeof req.headers["x-login"] === "string" ? req.headers["x-login"] : "";
  const passwordFromHeader = typeof req.headers["x-password"] === "string" ? req.headers["x-password"] : "";
  const login = String(body?.login || loginFromHeader || "").trim();
  const password = String(body?.password || passwordFromHeader || "").trim();
  return { login, password };
}

function pickInn(req: VercelRequest, body: any): string {
  const innFromHeader = typeof req.headers["x-inn"] === "string" ? req.headers["x-inn"] : "";
  return String(body?.inn || innFromHeader || "").trim();
}

function normalizeInn(value: unknown): string {
  return String(value || "").replace(/\D/g, "").trim();
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toPositiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pool = getPool();
  const body = req.method === "POST" ? req.body : req.query;
  const { login, password } = pickCredentials(req, body);
  const selectedInn = pickInn(req, body);
  const selectedInnNorm = normalizeInn(selectedInn);
  if (!login || !password) return res.status(400).json({ error: "login and password are required" });

  const verified = await verifyRegisteredUser(pool, login, password);
  if (!verified) return res.status(401).json({ error: "Неверный логин или пароль" });
  const verifiedInnNorm = normalizeInn(verified.inn);

  const loginKey = login.trim().toLowerCase();

  if (req.method === "GET") {
    const claimsColsRes = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'claims'`
    );
    const claimsCols = new Set(claimsColsRes.rows.map((r) => String(r.column_name || "").trim()));
    const hasExpertLogin = claimsCols.has("expert_login");

    const status = String(req.query.status || "").trim();
    const cargoNumber = String(req.query.cargoNumber || "").trim();
    const q = String(req.query.q || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const limit = Math.min(200, toPositiveInt(req.query.limit, 50));

    const where: string[] = [hasExpertLogin ? "(customer_login = $1 OR expert_login = $1)" : "customer_login = $1"];
    const params: unknown[] = [loginKey];

    if (selectedInnNorm) {
      if (!verified.accessAllInns && verifiedInnNorm && selectedInnNorm !== verifiedInnNorm) {
        return res.status(403).json({ error: "Нет доступа к выбранной компании" });
      }
      params.push(selectedInnNorm);
      where.push(`regexp_replace(customer_inn::text, '\\D', '', 'g') = $${params.length}`);
    }

    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (cargoNumber) {
      params.push(cargoNumber);
      where.push(`cargo_number = $${params.length}`);
    }
    if (dateFrom && isIsoDate(dateFrom)) {
      params.push(dateFrom);
      where.push(`created_at >= ($${params.length}::date)`);
    }
    if (dateTo && isIsoDate(dateTo)) {
      params.push(dateTo);
      where.push(`created_at < ($${params.length}::date + interval '1 day')`);
    }
    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      where.push(`(claim_number ilike $${idx} or cargo_number ilike $${idx} or customer_company_name ilike $${idx})`);
    }

    params.push(limit);

    const { rows } = await pool.query(
      `SELECT
         id,
         claim_number AS "claimNumber",
         cargo_number AS "cargoNumber",
         claim_type AS "claimType",
         description,
         requested_amount AS "requestedAmount",
         approved_amount AS "approvedAmount",
         status,
         ${hasExpertLogin
           ? `CASE
                WHEN customer_login = $1 THEN 'customer'
                WHEN expert_login = $1 THEN 'expert'
                ELSE 'other'
              END`
           : `'customer'`
         } AS "viewerRole",
         status_changed_at AS "statusChangedAt",
         sla_due_at AS "slaDueAt",
         customer_resolution AS "customerResolution",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM claims
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length}`,
      params
    );
    return res.json({ claims: rows });
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const cargoNumber = String(payload?.cargoNumber || "").trim();
  const claimTypeRaw = String(payload?.claimType || "").trim();
  const description = String(payload?.description || "").trim();
  const requestedAmount = parseMoney(payload?.requestedAmount);
  const customerContactName = String(payload?.customerContactName || "").trim();
  const customerPhone = String(payload?.customerPhone || "").trim();
  const customerEmail = String(payload?.customerEmail || "").trim();

  const photos = (Array.isArray(payload?.photos) ? payload.photos : []) as ClaimCreatePhoto[];
  const documents = (Array.isArray(payload?.documents) ? payload.documents : []) as ClaimCreateDocument[];
  const videoLinks = (Array.isArray(payload?.videoLinks) ? payload.videoLinks : []) as ClaimCreateVideoLink[];
  const selectedPlaces = (Array.isArray(payload?.selectedPlaces) ? payload.selectedPlaces : []) as ClaimSelectedPlace[];
  const manipulationSigns = (Array.isArray(payload?.manipulationSigns) ? payload.manipulationSigns : [])
    .map((v: unknown) => String(v || "").trim())
    .filter(Boolean);
  const packagingTypes = (Array.isArray(payload?.packagingTypes) ? payload.packagingTypes : [])
    .map((v: unknown) => String(v || "").trim())
    .filter(Boolean);

  if (!cargoNumber) return res.status(400).json({ error: "Укажите номер перевозки" });
  if (!isClaimType(claimTypeRaw)) return res.status(400).json({ error: "Неверный тип претензии" });
  if (!description) return res.status(400).json({ error: "Укажите описание претензии" });
  if (requestedAmount == null || requestedAmount < 0) return res.status(400).json({ error: "Некорректная сумма требования" });
  if (photos.length > 10) return res.status(400).json({ error: "Можно прикрепить не более 10 фото" });

  const userMeta = await pool.query<{
    inn: string;
    company_name: string;
    permissions: Record<string, boolean> | null;
  }>(
    `SELECT inn, company_name, permissions
     FROM registered_users
     WHERE login = $1 AND active = true
     LIMIT 1`,
    [loginKey]
  );
  const user = userMeta.rows[0];
  if (!user) return res.status(401).json({ error: "Пользователь не найден" });

  const customerCompanyName = String(payload?.customerCompanyName || user.company_name || "").trim();
  const customerInn = String(payload?.customerInn || user.inn || "").trim();
  if (!customerInn) return res.status(400).json({ error: "Не удалось определить ИНН заказчика" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimIns = await client.query<{
      id: number;
      claimNumber: string;
    }>(
      `INSERT INTO claims (
        customer_login, customer_company_name, customer_inn, customer_phone, customer_email,
        cargo_number, claim_type, description, requested_amount, status, status_changed_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',now())
      RETURNING id, claim_number as "claimNumber"`,
      [
        loginKey,
        customerCompanyName,
        customerInn,
        customerPhone,
        customerEmail,
        cargoNumber,
        claimTypeRaw,
        description,
        requestedAmount,
      ]
    );
    const claim = claimIns.rows[0];

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
        [claim.id, fileName, mimeType, caption, bytes]
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
        [claim.id, fileName, mimeType, docType, bytes]
      );
    }

    for (const v of videoLinks) {
      const url = String(v?.url || "").trim();
      const title = String(v?.title || "").trim();
      if (!url) continue;
      await client.query(
        `INSERT INTO claim_video_links (claim_id, url, title)
         VALUES ($1,$2,$3)`,
        [claim.id, url, title]
      );
    }

    await client.query(
      `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, to_status, payload)
       VALUES ($1,$2,'client','claim_draft_saved','draft',$3::jsonb)`,
      [claim.id, loginKey, JSON.stringify({ cargoNumber, claimType: claimTypeRaw, requestedAmount, customerContactName, selectedPlaces, manipulationSigns, packagingTypes })]
    );

    await client.query("COMMIT");
    return res.status(201).json({ ok: true, id: claim.id, claimNumber: claim.claimNumber });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: e?.message || "Ошибка создания претензии" });
  } finally {
    client.release();
  }
}
