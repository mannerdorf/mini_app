import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { decodeBase64File, isClaimStatus, parseMoney } from "../lib/claims.js";
import { getPool } from "./_db.js";
import { initRequestContext } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-claim-update");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as any)?.admin) return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const claimId = Number(body?.claimId);
  if (!Number.isFinite(claimId) || claimId <= 0) return res.status(400).json({ error: "Некорректный claimId", request_id: ctx.requestId });
  const action = String(body?.action || "").trim();

  const nextStatusRaw = String(body?.status || "").trim();
  const managerLogin = String(body?.managerLogin || "").trim().toLowerCase();
  const expertLogin = String(body?.expertLogin || "").trim().toLowerCase();
  const leaderLogin = String(body?.leaderLogin || "").trim().toLowerCase();
  const accountantLogin = String(body?.accountantLogin || "").trim().toLowerCase();
  const managerNote = String(body?.managerNote || "").trim();
  const leaderComment = String(body?.leaderComment || "").trim();
  const accountingNote = String(body?.accountingNote || "").trim();
  const internalComment = String(body?.internalComment || "").trim();
  const approvedAmount = parseMoney(body?.approvedAmount);
  const enqueuePush = body?.enqueuePush !== false;

  if (nextStatusRaw && !isClaimStatus(nextStatusRaw)) return res.status(400).json({ error: "Некорректный статус", request_id: ctx.requestId });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query<{
      id: number;
      status: string;
      customerLogin: string;
      claimNumber: string;
    }>(
      `SELECT id, status, customer_login as "customerLogin", claim_number as "claimNumber"
       FROM claims
       WHERE id = $1
       FOR UPDATE`,
      [claimId]
    );
    const current = currentRes.rows[0];
    if (!current) throw new Error("Претензия не найдена");

    if (action === "delete") {
      if ((payload as any)?.superAdmin !== true) {
        throw new Error("Удаление доступно только суперадминистратору");
      }
      await client.query("DELETE FROM claims WHERE id = $1", [claimId]);
      await client.query("COMMIT");
      return res.json({ ok: true, deleted: true, request_id: ctx.requestId });
    }

    if (action === "upload_documents") {
      const photos = Array.isArray(body?.photos) ? body.photos : [];
      const documents = Array.isArray(body?.documents) ? body.documents : [];
      const videoLinks = Array.isArray(body?.videoLinks) ? body.videoLinks : [];
      const actorRole = String(body?.actorRole || "").trim().toLowerCase() === "leader" ? "leader" : "manager";
      const actorLogin = String(body?.actorLogin || "admin").trim() || "admin";
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
          [claimId, url, title || "Видео от сотрудника"]
        );
      }

      await client.query(
        `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, payload)
         VALUES ($1,$2,$3,'documents_uploaded',$4::jsonb)`,
        [claimId, actorLogin, actorRole, JSON.stringify({ photos: photos.length, documents: documents.length, videoLinks: videoLinks.length })]
      );

      if (managerNote || leaderComment) {
        const updateSets: string[] = [];
        const updateParams: unknown[] = [claimId];
        if (managerNote) {
          updateParams.push(managerNote);
          updateSets.push(`manager_note = $${updateParams.length}`);
        }
        if (leaderComment) {
          updateParams.push(leaderComment);
          updateSets.push(`leader_comment = $${updateParams.length}`);
        }
        if (updateSets.length > 0) {
          await client.query(
            `UPDATE claims SET ${updateSets.join(", ")} WHERE id = $1`,
            updateParams
          );
        }
      }

      await client.query("COMMIT");
      return res.json({ ok: true, request_id: ctx.requestId });
    }

    const sets: string[] = [];
    const params: unknown[] = [claimId];

    if (nextStatusRaw) {
      params.push(nextStatusRaw);
      sets.push(`status = $${params.length}`);
      sets.push(`status_changed_at = now()`);
    }
    if (managerLogin) {
      params.push(managerLogin);
      sets.push(`manager_login = $${params.length}`);
    }
    if (expertLogin) {
      params.push(expertLogin);
      sets.push(`expert_login = $${params.length}`);
    }
    if (leaderLogin) {
      params.push(leaderLogin);
      sets.push(`leader_login = $${params.length}`);
    }
    if (accountantLogin) {
      params.push(accountantLogin);
      sets.push(`accountant_login = $${params.length}`);
    }
    if (managerNote) {
      params.push(managerNote);
      sets.push(`manager_note = $${params.length}`);
    }
    if (leaderComment) {
      params.push(leaderComment);
      sets.push(`leader_comment = $${params.length}`);
    }
    if (accountingNote) {
      params.push(accountingNote);
      sets.push(`accounting_note = $${params.length}`);
    }
    if (approvedAmount != null) {
      params.push(approvedAmount);
      sets.push(`approved_amount = $${params.length}`);
    }

    if (sets.length > 0) {
      await client.query(
        `UPDATE claims
         SET ${sets.join(", ")}
         WHERE id = $1`,
        params
      );
    }

    if (internalComment) {
      await client.query(
        `INSERT INTO claim_comments (claim_id, author_login, author_role, comment_text, is_internal)
         VALUES ($1, $2, 'manager', $3, true)`,
        [claimId, "admin", internalComment]
      );
    }

    await client.query(
      `INSERT INTO claim_events (claim_id, actor_login, actor_role, event_type, from_status, to_status, payload)
       VALUES ($1, 'admin', 'manager', $2, $3, $4, $5::jsonb)`,
      [
        claimId,
        nextStatusRaw ? "status_changed" : "claim_updated",
        current.status,
        nextStatusRaw || current.status,
        JSON.stringify({
          managerLogin: managerLogin || undefined,
          expertLogin: expertLogin || undefined,
          leaderLogin: leaderLogin || undefined,
          accountantLogin: accountantLogin || undefined,
          managerNote: managerNote || undefined,
          leaderComment: leaderComment || undefined,
          accountingNote: accountingNote || undefined,
          approvedAmount: approvedAmount ?? undefined,
          internalComment: internalComment || undefined,
        }),
      ]
    );

    if (enqueuePush) {
      const pushTitle = nextStatusRaw
        ? `Претензия ${current.claimNumber}: статус изменен`
        : `Претензия ${current.claimNumber}: обновление`;
      const pushBody = nextStatusRaw
        ? `Новый статус: ${nextStatusRaw}`
        : "В карточке претензии есть обновления";
      await client.query(
        `INSERT INTO claim_push_queue (claim_id, recipient_login, title, body, payload, status)
         VALUES ($1,$2,$3,$4,$5::jsonb,'pending')`,
        [claimId, current.customerLogin, pushTitle, pushBody, JSON.stringify({ status: nextStatusRaw || null })]
      );
    }

    await client.query("COMMIT");
    return res.json({ ok: true, request_id: ctx.requestId });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: e?.message || "Ошибка обновления претензии", request_id: ctx.requestId });
  } finally {
    client.release();
  }
}
