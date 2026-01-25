import type { VercelRequest, VercelResponse } from "@vercel/node";
import { urlStore } from "../shorten";

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    const response = await fetch(`${url}/get/${key}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.result || null;
  } catch (error) {
    console.error("Redis get error:", error);
    return null;
  }
}

/**
 * Редирект с короткой ссылки на оригинальный URL
 * Использование: /api/s/abc12345
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = req.query.slug as string;

  if (!slug || typeof slug !== "string") {
    return res.status(400).json({ error: "Slug is required" });
  }

  // Пробуем получить из Redis
  let url = await getRedisValue(`short:${slug}`);

  // Fallback: пробуем из памяти
  if (!url) {
    const entry = urlStore.get(slug);
    url = entry?.url || null;
  }

  if (!url) {
    return res.status(404).json({ error: "Short link not found" });
  }

  // Редирект на оригинальный URL
  return res.redirect(302, url);
}
