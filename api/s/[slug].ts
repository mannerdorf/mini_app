import type { VercelRequest, VercelResponse } from "@vercel/node";
import { urlStore } from "../shorten";

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("Upstash Redis not configured in redirect handler");
    return null;
  }

  try {
    // Upstash REST API формат: POST с командой в body
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["GET", key]]),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error("Redis get error:", response.status, text);
      return null;
    }
    
    const data = await response.json();
    // Upstash pipeline возвращает массив результатов
    // Формат: [{result: "value"}] или [{result: "value", error: null}]
    const firstResult = Array.isArray(data) ? data[0] : data;
    const value = firstResult?.result;
    
    // Если result null или undefined, значит ключ не найден
    return value || null;
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
