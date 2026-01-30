import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisValue, deleteRedisValue } from "./redis";

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

  const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
  if (!login) {
    return res.status(400).json({ error: "login is required" });
  }

  const userId = await getRedisValue(`alice:login:${login}`);
  if (!userId) {
    return res.status(200).json({ ok: true, message: "Привязка к Алисе не найдена или уже отключена." });
  }

  const d1 = await deleteRedisValue(`alice:bind:${userId}`);
  const d2 = await deleteRedisValue(`alice:login:${login}`);
  return res.status(200).json({ ok: true, unlinked: d1 || d2 });
}
