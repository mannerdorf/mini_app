import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminTokenFromRequest, getAdminTokenPayload } from "../lib/adminAuth.js";
import { isClaimStatus, parseMoney } from "../lib/claims.js";
import { getPool } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAdminTokenFromRequest(req);
  const payload = getAdminTokenPayload(token);
  if (!(payload as any)?.admin) return res.status(401).json({ error: "Требуется авторизация админа" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const claimId = Number(body?.claimId);
  if (!Number.isFinite(claimId) || claimId <= 0) return res.status(400).json({ error: "Некорректный claimId" });
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

  if (nextStatusRaw && !isClaimStatus(nextStatusRaw)) return res.status(400).json({ error: "Некорректный статус" });

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
      return res.json({ ok: true, deleted: true });
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
    return res.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: e?.message || "Ошибка обновления претензии" });
  } finally {
    client.release();
  }
}
