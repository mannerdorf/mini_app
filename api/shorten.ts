import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

// Используем Upstash Redis для хранения коротких ссылок
// Бесплатный tier: https://upstash.com
// Добавь в Vercel Environment Variables:
// - UPSTASH_REDIS_REST_URL
// - UPSTASH_REDIS_REST_TOKEN

const MAX_AGE = 30 * 24 * 60 * 60; // 30 дней в секундах

async function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("Upstash Redis not configured, falling back to in-memory (not persistent)");
    return null;
  }

  return { url, token };
}

async function setRedis(key: string, value: string, ttl: number) {
  const redis = await getRedis();
  if (!redis) return false;

  try {
    // Upstash REST API формат: POST с командой в body
    const response = await fetch(`${redis.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["SET", key, value],
        ["EXPIRE", key, ttl],
      ]),
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error("Redis set error:", response.status, text);
      return false;
    }
    
    const data = await response.json();
    // Upstash pipeline возвращает массив результатов
    // Формат: [{result: "OK"}, {result: 1}] или [{result: "OK", error: null}, ...]
    const firstResult = Array.isArray(data) ? data[0] : data;
    const setResult = firstResult?.result === "OK" || firstResult?.result === true;
    
    if (!setResult) {
      console.error("Redis SET failed:", JSON.stringify(data));
    }
    
    return setResult;
  } catch (error) {
    console.error("Redis set error:", error);
    return false;
  }
}

async function getRedisValue(key: string): Promise<string | null> {
  const redis = await getRedis();
  if (!redis) return null;

  try {
    // Upstash REST API формат: POST с командой в body
    const response = await fetch(`${redis.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
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

// Fallback in-memory хранилище (только если Redis не настроен)
const urlStore = new Map<string, { url: string; createdAt: number }>();

/**
 * Создает короткую ссылку из длинного URL
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let body: any = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    const { url } = body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    // Валидация URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    // Создаем короткий slug на основе хеша URL
    // Используем первые 8 символов хеша для короткой ссылки
    const hash = crypto.createHash("sha256").update(url).digest("hex");
    const slug = hash.substring(0, 8);

    // Сохраняем в Redis (или fallback в память)
    const saved = await setRedis(`short:${slug}`, url, MAX_AGE);
    if (!saved) {
      // Fallback: сохраняем в память (не персистентно)
      urlStore.set(slug, {
        url,
        createdAt: Date.now(),
      });
    }

    // Определяем базовый URL
    const host = req.headers.host || req.headers["x-forwarded-host"];
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const shortUrl = `${protocol}://${host}/api/s/${slug}`;

    return res.status(200).json({
      shortUrl,
      slug,
      originalUrl: url,
    });
  } catch (error: any) {
    console.error("Shorten error:", error);
    return res.status(500).json({
      error: "Failed to create short URL",
      message: error?.message || String(error),
    });
  }
}

/**
 * Экспортируем хранилище для использования в редиректе
 */
export { urlStore };
