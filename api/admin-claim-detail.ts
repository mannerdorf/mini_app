import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { getPool } from "./_db.js";

function normalizeCargoNumber(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/^0000-/, "");
  const withoutZeros = raw.replace(/^0+/, "");
  return withoutZeros || raw || "";
}

function getAllKeyValuePairs(input: unknown, out: Array<{ key: string; value: unknown }> = []): Array<{ key: string; value: unknown }> {
  if (!input || typeof input !== "object") return out;
  if (Array.isArray(input)) {
    for (const item of input) getAllKeyValuePairs(item, out);
    return out;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out.push({ key, value });
    if (value && typeof value === "object") getAllKeyValuePairs(value, out);
  }
  return out;
}

function hasDocRef(pairs: Array<{ key: string; value: unknown }>): boolean {
  return pairs.some(({ key, value }) => {
    if (!/(ttn|ттн|наклад|cmr)/i.test(key)) return false;
    const v = String(value ?? "").trim();
    return v !== "" && v.toLowerCase() !== "false" && v !== "0" && v !== "null";
  });
}

function hasDamageMark(pairs: Array<{ key: string; value: unknown }>): boolean {
  return pairs.some(({ key, value }) => {
    if (!/(повреж|бой|дефект|утрат|недостач|damage|loss|shortage)/i.test(key)) return false;
    const v = String(value ?? "").trim().toLowerCase();
    if (!v) return false;
    return !["нет", "false", "0", "no", "null"].includes(v);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as any)?.admin) return res.status(401).json({ error: "Требуется авторизация админа" });

  const claimId = Number(req.query.id);
  if (!Number.isFinite(claimId) || claimId <= 0) return res.status(400).json({ error: "Некорректный id претензии" });

  const pool = getPool();

  const claimRes = await pool.query(
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
  const claim = claimRes.rows[0];
  if (!claim) return res.status(404).json({ error: "Претензия не найдена" });

  const [photos, documents, videoLinks, comments, events] = await Promise.all([
    pool.query(
      `SELECT id, file_name AS "fileName", mime_type AS "mimeType", caption,
              encode(file_bytes, 'base64') AS "base64",
              created_at AS "createdAt"
       FROM claim_photos
       WHERE claim_id = $1
       ORDER BY id ASC`,
      [claimId]
    ),
    pool.query(
      `SELECT id, file_name AS "fileName", mime_type AS "mimeType", doc_type AS "docType",
              encode(file_bytes, 'base64') AS "base64",
              created_at AS "createdAt"
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
      `SELECT id, author_login AS "authorLogin", author_role AS "authorRole",
              comment_text AS "commentText", is_internal AS "isInternal",
              created_at AS "createdAt"
       FROM claim_comments
       WHERE claim_id = $1
       ORDER BY id ASC`,
      [claimId]
    ),
    pool.query(
      `SELECT id, actor_login AS "actorLogin", actor_role AS "actorRole",
              event_type AS "eventType", from_status AS "fromStatus", to_status AS "toStatus",
              payload, created_at AS "createdAt"
       FROM claim_events
       WHERE claim_id = $1
       ORDER BY id ASC`,
      [claimId]
    ),
  ]);

  const cargoNorm = normalizeCargoNumber(claim.cargoNumber);
  let orderFound = false;
  let sendingFound = false;
  let ttnFound = false;
  let damageMarksFound = false;

  try {
    const [ordersCache, sendingsCache] = await Promise.all([
      pool.query<{ data: any[] }>("SELECT data FROM cache_orders WHERE id = 1 LIMIT 1"),
      pool.query<{ data: any[] }>("SELECT data FROM cache_sendings WHERE id = 1 LIMIT 1"),
    ]);
    const orders = Array.isArray(ordersCache.rows[0]?.data) ? ordersCache.rows[0].data : [];
    const sendings = Array.isArray(sendingsCache.rows[0]?.data) ? sendingsCache.rows[0].data : [];

    const matchByCargo = (item: any) => {
      const variants = [
        item?.НомерПеревозки,
        item?.NumberPerevozki,
        item?.CargoNumber,
        item?.Перевозка,
        item?.Номер,
        item?.Number,
      ];
      return variants.some((v) => normalizeCargoNumber(v) && normalizeCargoNumber(v) === cargoNorm);
    };

    const orderRow = orders.find(matchByCargo);
    const sendingRow = sendings.find(matchByCargo);

    orderFound = !!orderRow;
    sendingFound = !!sendingRow;

    const pairs = [
      ...(orderRow ? getAllKeyValuePairs(orderRow) : []),
      ...(sendingRow ? getAllKeyValuePairs(sendingRow) : []),
    ];
    ttnFound = hasDocRef(pairs);
    damageMarksFound = hasDamageMark(pairs);
  } catch {
    // no-op: keep unknown flags as false
  }

  return res.json({
    claim,
    photos: photos.rows,
    documents: documents.rows,
    videoLinks: videoLinks.rows,
    comments: comments.rows,
    events: events.rows,
    ttnCheck: {
      orderFound,
      sendingFound,
      ttnFound,
      damageMarksFound,
    },
  });
}
