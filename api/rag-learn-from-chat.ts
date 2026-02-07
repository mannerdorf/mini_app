import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

/**
 * Автообучение: перебор диалогов из chat_messages, извлечение пар (запрос → ответ)
 * и добавление их в chat_capabilities как новые навыки/примеры.
 *
 * GET или POST. Параметры (query или body):
 * - daysBack: за сколько дней брать сообщения (по умолчанию 7)
 * - limit: сколько пар добавить за один запуск (по умолчанию 15)
 * - minReplyLength: минимальная длина ответа ассистента (по умолчанию 80)
 */
const SKIP_STARTS = ["Извините", "Ошибка", "Сервис временно", "не удалось получить"];
const MIN_REPLY_LENGTH = 80;
const MAX_PAIR_CONTENT = 2000;

function isSkipReply(content: string): boolean {
  const t = content.trim();
  if (t.length < MIN_REPLY_LENGTH) return true;
  return SKIP_STARTS.some((s) => t.startsWith(s));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? (req.body ? JSON.parse(req.body) : {}) : req.body || {};
    const query = req.query || {};
    const daysBack = Number(body.daysBack ?? query.daysBack ?? 7);
    const limit = Math.min(30, Math.max(1, Number(body.limit ?? query.limit ?? 15)));
    const minReplyLength = Math.max(20, Number(body.minReplyLength ?? query.minReplyLength ?? MIN_REPLY_LENGTH));

    const pool = getPool();

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromStr = fromDate.toISOString();

    const rows = await pool.query<{ session_id: string; role: string; content: string; created_at: Date }>(
      `select session_id, role, content, created_at
       from chat_messages
       where created_at >= $1
       order by session_id, created_at asc`,
      [fromStr],
    );

    const pairs: { user: string; assistant: string }[] = [];
    let lastUser: string | null = null;
    let lastSession: string | null = null;

    for (const row of rows.rows) {
      if (row.role === "user") {
        lastUser = row.content.trim();
        lastSession = row.session_id;
      } else if (row.role === "assistant" && lastUser && lastSession === row.session_id) {
        const assistant = row.content.trim();
        if (assistant.length >= minReplyLength && !isSkipReply(assistant)) {
          pairs.push({ user: lastUser, assistant });
        }
        lastUser = null;
      }
    }

    const seen = new Set<string>();
    const toAdd: { user: string; assistant: string }[] = [];
    for (const p of pairs) {
      const key = p.user.slice(0, 80).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      toAdd.push(p);
      if (toAdd.length >= limit) break;
    }

    const existing = await pool.query<{ slug: string }>(
      `select slug from chat_capabilities where slug like 'learned_%'`,
    );
    const existingSet = new Set(existing.rows.map((r) => r.slug));
    let seq = existingSet.size;

    const added: { slug: string; title: string }[] = [];
    for (const p of toAdd) {
      const slug = `learned_${Date.now().toString(36)}_${seq}_${Math.random().toString(36).slice(2, 8)}`;
      seq += 1;
      const title = "Пример из чата";
      const content = `Вариант запроса пользователя: ${truncate(p.user, 500)}\n\nОтвет ассистента (ориентир для модели): ${truncate(p.assistant, MAX_PAIR_CONTENT)}`;

      await pool.query(
        `insert into chat_capabilities (slug, title, content, updated_at)
         values ($1, $2, $3, now())
         on conflict (slug) do update set title = excluded.title, content = excluded.content, updated_at = now()`,
        [slug, title, content],
      );
      added.push({ slug, title });
    }

    return res.status(200).json({
      ok: true,
      added: added.length,
      pairsScanned: pairs.length,
      uniqueCandidates: toAdd.length,
      samples: added.slice(0, 5),
    });
  } catch (err: any) {
    console.error("rag-learn-from-chat error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Learn failed" });
  }
}
