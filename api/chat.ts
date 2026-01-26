import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import { getPool } from "./_db";

type ChatRole = "system" | "user" | "assistant";

function coerceBody(req: VercelRequest): any {
  let body: any = req.body;
  if (typeof body === "string") {
    body = JSON.parse(body);
  }
  return body ?? {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { sessionId, userId, message } = coerceBody(req);
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const sid =
      typeof sessionId === "string" && sessionId.trim()
        ? sessionId.trim()
        : crypto.randomUUID();

    const pool = getPool();
    await pool.query(
      `insert into chat_sessions (id, user_id)
       values ($1, $2)
       on conflict (id) do update
         set user_id = coalesce(chat_sessions.user_id, excluded.user_id),
             updated_at = now()`,
      [sid, typeof userId === "string" ? userId : null],
    );

    await pool.query(
      `insert into chat_messages (session_id, role, content)
       values ($1, 'user', $2)`,
      [sid, message],
    );

    const history = await pool.query<{
      role: ChatRole;
      content: string;
    }>(
      `select role, content
       from chat_messages
       where session_id = $1
       order by created_at desc
       limit 20`,
      [sid],
    );

    const messages: { role: ChatRole; content: string }[] = [
      {
        role: "system",
        content:
          "Ты — AI-логист HAULZ. Отвечай профессионально, кратко и понятно. Если данных недостаточно — задай уточняющий вопрос. Не проси пароли и не повторяй их.",
      },
      ...history.rows.reverse(),
    ];

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";

    await pool.query(
      `insert into chat_messages (session_id, role, content)
       values ($1, 'assistant', $2)`,
      [sid, reply],
    );
    await pool.query(`update chat_sessions set updated_at = now() where id = $1`, [
      sid,
    ]);

    return res.status(200).json({ sessionId: sid, reply });
  } catch (err: any) {
    console.error("chat error:", err?.message || err);
    return res.status(500).json({ error: "chat failed" });
  }
}

