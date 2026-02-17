import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db";
import { deleteRedisValue } from "./redis";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const loginRaw = String(body?.login || "").trim();
  const login = loginRaw.toLowerCase();
  if (!login) return res.status(400).json({ error: "login is required" });

  await Promise.allSettled([
    deleteRedisValue(`tg:by_login:${login}`),
    ...(loginRaw && loginRaw !== login ? [deleteRedisValue(`tg:by_login:${loginRaw}`)] : []),
  ]);

  try {
    const pool = getPool();

    const linkedChats = await pool.query<{ telegram_chat_id: string }>(
      `select telegram_chat_id
       from telegram_chat_links
       where lower(trim(login)) = $1
         and telegram_chat_id is not null
         and telegram_chat_id <> ''`,
      [login]
    );

    for (const row of linkedChats.rows) {
      const chatId = String(row.telegram_chat_id || "").trim();
      if (!chatId) continue;
      await Promise.allSettled([
        deleteRedisValue(`tg:bind:${chatId}`),
        deleteRedisValue(`tg:onboarding:${chatId}`),
        deleteRedisValue(`tg:activation:code:${chatId}`),
      ]);
    }

    await pool.query(
      `update telegram_chat_links
       set chat_status = 'disabled', updated_at = now(), last_seen_at = now()
       where lower(trim(login)) = $1`,
      [login]
    );

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    if (e?.code === "42P01") {
      // Compatibility: if table is not created yet, redis unlink is already done.
      return res.status(200).json({ ok: true, warning: "telegram_chat_links table is missing" });
    }
    return res.status(500).json({ error: e?.message || "Failed to unlink Telegram" });
  }
}
