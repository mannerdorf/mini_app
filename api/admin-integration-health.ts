import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { verifyAdminToken, getAdminTokenFromRequest } from "../lib/adminAuth.js";
import { withErrorLog } from "../lib/requestErrorLog.js";

type RedisCommand = [string, ...string[]];

async function redisPipeline(commands: RedisCommand[]): Promise<any[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || commands.length === 0) return null;
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  } catch {
    return null;
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа" });
  }

  const daysRaw = Number.parseInt(String(req.query.days ?? "30"), 10);
  const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(1, daysRaw)) : 30;

  try {
    const pool = getPool();

    const [
      telegramStatusRes,
      telegramLifetimeRes,
      emailDeliveryRes,
      requestErrorRes,
      activeUsersRes,
    ] = await Promise.all([
      pool.query<{ chat_status: string; cnt: string }>(
        `select chat_status, count(*)::text as cnt
         from telegram_chat_links
         group by chat_status`
      ).catch((e: any) => {
        if (e?.code === "42P01") return { rows: [] as { chat_status: string; cnt: string }[] };
        throw e;
      }),
      pool.query<{ active_avg_hours: string | null; pending_avg_hours: string | null }>(
        `select
           round(avg(extract(epoch from (now() - created_at))) / 3600, 1)::text as active_avg_hours,
           (
             select round(avg(extract(epoch from (now() - created_at))) / 3600, 1)::text
             from telegram_chat_links
             where chat_status = 'pending'
           ) as pending_avg_hours
         from telegram_chat_links
         where chat_status = 'active'`
      ).catch((e: any) => {
        if (e?.code === "42P01") return { rows: [{ active_avg_hours: null, pending_avg_hours: null }] };
        throw e;
      }),
      pool.query<{ action: string; cnt: string }>(
        `select action, count(*)::text as cnt
         from admin_audit_log
         where created_at >= now() - ($1::text || ' days')::interval
           and action in (
             'email_delivery_registration_sent',
             'email_delivery_registration_failed',
             'email_delivery_password_reset_sent',
             'email_delivery_password_reset_failed',
             'email_delivery_telegram_pin_sent',
             'email_delivery_telegram_pin_failed'
           )
         group by action`,
        [String(days)]
      ),
      pool.query<{ path: string; cnt: string }>(
        `select path, count(*)::text as cnt
         from request_error_log
         where created_at >= now() - ($1::text || ' days')::interval
           and path in ('/api/tg-webhook', '/api/max-link', '/api/max-webhook', '/api/admin-register-user', '/api/admin-user-update')
         group by path`,
        [String(days)]
      ),
      pool.query<{ login: string }>(
        `select login
         from registered_users
         where active = true and coalesce(trim(login), '') <> ''`
      ),
    ]);

    const telegramStatusMap = new Map<string, number>();
    for (const row of telegramStatusRes.rows) {
      telegramStatusMap.set(row.chat_status, Number(row.cnt) || 0);
    }

    const emailMap = new Map<string, number>();
    for (const row of emailDeliveryRes.rows) {
      emailMap.set(row.action, Number(row.cnt) || 0);
    }

    const errorMap = new Map<string, number>();
    for (const row of requestErrorRes.rows) {
      errorMap.set(row.path, Number(row.cnt) || 0);
    }

    const activeLogins = activeUsersRes.rows
      .map((r) => String(r.login || "").trim().toLowerCase())
      .filter(Boolean);

    let voiceLinkedLogins = 0;
    const voiceChatIds = new Set<string>();
    if (activeLogins.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < activeLogins.length; i += batchSize) {
        const chunk = activeLogins.slice(i, i + batchSize);
        const commands: RedisCommand[] = chunk.map((login) => ["GET", `max:by_login:${login}`]);
        const pipelineRows = await redisPipeline(commands);
        if (!pipelineRows) continue;
        pipelineRows.forEach((item, idx) => {
          const value = item?.result;
          if (value !== null && value !== undefined && String(value).trim() !== "") {
            voiceLinkedLogins += 1;
            voiceChatIds.add(String(value));
          }
        });
      }
    }

    const lifetime = telegramLifetimeRes.rows[0] || { active_avg_hours: null, pending_avg_hours: null };

    return res.status(200).json({
      ok: true,
      days,
      telegram: {
        linked_total:
          (telegramStatusMap.get("active") || 0) +
          (telegramStatusMap.get("pending") || 0) +
          (telegramStatusMap.get("disabled") || 0),
        active: telegramStatusMap.get("active") || 0,
        pending: telegramStatusMap.get("pending") || 0,
        disabled: telegramStatusMap.get("disabled") || 0,
        avg_lifetime_hours_active: lifetime.active_avg_hours ? Number(lifetime.active_avg_hours) : null,
        avg_pending_hours: lifetime.pending_avg_hours ? Number(lifetime.pending_avg_hours) : null,
        pin_email_sent: emailMap.get("email_delivery_telegram_pin_sent") || 0,
        pin_email_failed: emailMap.get("email_delivery_telegram_pin_failed") || 0,
        webhook_errors: errorMap.get("/api/tg-webhook") || 0,
      },
      email_delivery: {
        registration: {
          sent: emailMap.get("email_delivery_registration_sent") || 0,
          failed: emailMap.get("email_delivery_registration_failed") || 0,
        },
        password_reset: {
          sent: emailMap.get("email_delivery_password_reset_sent") || 0,
          failed: emailMap.get("email_delivery_password_reset_failed") || 0,
        },
        telegram_pin: {
          sent: emailMap.get("email_delivery_telegram_pin_sent") || 0,
          failed: emailMap.get("email_delivery_telegram_pin_failed") || 0,
        },
        api_errors: {
          register: errorMap.get("/api/admin-register-user") || 0,
          reset: errorMap.get("/api/admin-user-update") || 0,
          tg_webhook: errorMap.get("/api/tg-webhook") || 0,
        },
      },
      voice_assistant: {
        linked_logins: voiceLinkedLogins,
        linked_chats_unique: voiceChatIds.size,
        link_errors: (errorMap.get("/api/max-link") || 0) + (errorMap.get("/api/max-webhook") || 0),
        max_link_errors: errorMap.get("/api/max-link") || 0,
        max_webhook_errors: errorMap.get("/api/max-webhook") || 0,
      },
    });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("admin-integration-health error:", err);
    return res.status(500).json({ error: err?.message || "Ошибка загрузки дашборда интеграций" });
  }
}

export default withErrorLog(handler);
