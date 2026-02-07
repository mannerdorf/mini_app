import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";

function coerceBody(req: VercelRequest): any {
  try {
    let body: any = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    return body ?? {};
  } catch {
    return {};
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { sessionId } = coerceBody(req);
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const pool = getPool();
    await pool.query(`delete from chat_sessions where id = $1`, [sessionId]);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("chat-reset error:", err?.message || err);
    return res.status(200).json({ ok: false, error: "chat-reset failed" });
  }
}

