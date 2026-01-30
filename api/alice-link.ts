import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setRedisValue } from "./redis";

const CODE_TTL_SECONDS = 60 * 10; // 10 minutes

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

  const login = String(body?.login || "").trim();
  const password = String(body?.password || "").trim();
  const customer = body?.customer ? String(body.customer) : null;
  const inn = body?.inn != null ? String(body.inn).trim() : undefined;
  if (!login || !password) {
    return res.status(400).json({ error: "login and password are required" });
  }

  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code = String(Math.floor(100000 + Math.random() * 900000));
    const saved = await setRedisValue(
      `alice:link:${code}`,
      JSON.stringify({ login, password, customer, inn: inn || undefined, createdAt: Date.now() }),
      CODE_TTL_SECONDS
    );
    if (saved) {
      return res.status(200).json({ ok: true, code, ttl: CODE_TTL_SECONDS });
    }
  }

  return res.status(500).json({ error: "Failed to generate code" });
}
