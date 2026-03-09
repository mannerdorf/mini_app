import type { VercelRequest, VercelResponse } from "@vercel/node";
import webpush from "web-push";
import { getPool } from "../_db.js";
import { getRedisValue } from "../redis.js";
import { requireCronAuth } from "../_lib/cronAuth.js";

type QueueRow = {
  id: number;
  recipient_login: string;
  title: string;
  body: string;
  payload: any;
  retries: number;
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronAuthError = requireCronAuth(req);
  if (cronAuthError) {
    return res.status(cronAuthError.status).json({ error: cronAuthError.error });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(503)
      .send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка конфигурации</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">Ошибка конфигурации</h1><p>Не заданы VAPID ключи для web push.</p></body></html>');
  }
  webpush.setVapidDetails("mailto:support@haulz.ru", publicKey, privateKey);

  const pool = getPool();
  const client = await pool.connect();
  let picked: QueueRow[] = [];
  try {
    await client.query("BEGIN");
    const pickedRes = await client.query<QueueRow>(
      `SELECT id, recipient_login, title, body, payload, retries
       FROM claim_push_queue
       WHERE status = 'pending' AND scheduled_at <= now()
       ORDER BY id ASC
       LIMIT 100
       FOR UPDATE SKIP LOCKED`
    );
    picked = pickedRes.rows;
    if (picked.length > 0) {
      const ids = picked.map((r) => r.id);
      await client.query(`UPDATE claim_push_queue SET status = 'processing' WHERE id = ANY($1)`, [ids]);
    }
    await client.query("COMMIT");
  } catch (e: any) {
    await client.query("ROLLBACK");
    client.release();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(500)
      .send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head><body style="font-family:sans-serif;padding:2rem;"><h1 style="color:#c00;">Ошибка чтения очереди</h1><p>${escapeHtml(e?.message || String(e))}</p></body></html>`);
  }
  client.release();

  let sent = 0;
  let failed = 0;

  for (const row of picked) {
    const login = String(row.recipient_login || "").trim().toLowerCase();
    const redisKey = `webpush:subs:${login}`;
    const raw = await getRedisValue(redisKey);
    let subs: any[] = [];
    try {
      subs = raw ? JSON.parse(raw) : [];
    } catch {
      subs = [];
    }
    if (!Array.isArray(subs)) subs = [];

    const payload = JSON.stringify({
      title: String(row.title || "HAULZ"),
      body: String(row.body || ""),
      url: `/documents?section=Претензии`,
      claim: row.payload || null,
    });

    let sentAtLeastOne = false;
    let lastError = "";
    for (const sub of subs) {
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) continue;
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
            expirationTime: sub.expirationTime ?? undefined,
          },
          payload,
          { TTL: 60 * 60 * 24 }
        );
        sentAtLeastOne = true;
      } catch (e: any) {
        lastError = e?.message || String(e);
      }
    }

    try {
      if (sentAtLeastOne) {
        sent += 1;
        await pool.query(
          `UPDATE claim_push_queue
           SET status = 'sent', sent_at = now(), error_message = null, retries = retries + 1
           WHERE id = $1`,
          [row.id]
        );
      } else {
        failed += 1;
        await pool.query(
          `UPDATE claim_push_queue
           SET status = 'failed', error_message = $2, retries = retries + 1
           WHERE id = $1`,
          [row.id, lastError || "Нет webpush подписок для login"]
        );
      }
    } catch {
      failed += 1;
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Push queue processed</title></head><body style="font-family:sans-serif;padding:2rem;max-width:48rem;margin:0 auto;background:#fff;color:#111;"><h1>Очередь push обработана</h1><ul><li>Взято задач: <strong>${picked.length}</strong></li><li>Отправлено: <strong>${sent}</strong></li><li>Ошибок: <strong>${failed}</strong></li></ul></body></html>`
  );
}
