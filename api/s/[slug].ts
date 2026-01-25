import type { VercelRequest, VercelResponse } from "@vercel/node";

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("[s/[slug]] Upstash Redis not configured in redirect handler");
    return null;
  }

  try {
    // Проверяем доступность fetch
    if (typeof fetch === 'undefined') {
      console.error("[s/[slug]] fetch is not available in this runtime");
      return null;
    }
    
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
      console.error(`[s/[slug]] Redis get error: ${response.status} ${text}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[s/[slug]] Redis response for ${key}:`, JSON.stringify(data));
    
    // Upstash pipeline возвращает массив результатов
    // Формат: [{result: "value"}] или [{result: "value", error: null}]
    const firstResult = Array.isArray(data) ? data[0] : data;
    
    // Проверяем наличие ошибки в ответе
    if (firstResult?.error) {
      console.error(`[s/[slug]] Redis error in response:`, firstResult.error);
      return null;
    }
    
    const value = firstResult?.result;
    
    // Если result null или undefined, значит ключ не найден
    if (value === null || value === undefined) {
      console.log(`[s/[slug]] Key not found in Redis: ${key}`);
      return null;
    }
    
    return String(value);
  } catch (error: any) {
    console.error(`[s/[slug]] Redis get exception:`, error?.message || error);
    return null;
  }
}

/**
 * Редирект с короткой ссылки на оригинальный URL
 * Использование: /api/s/abc12345
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const slug = req.query.slug as string;

    if (!slug || typeof slug !== "string") {
      return res.status(400).json({ error: "Slug is required" });
    }

    console.log(`[s/[slug]] Looking up slug: ${slug}`);

    // Пробуем получить из Redis
    let url = await getRedisValue(`short:${slug}`);

    // В serverless окружении in-memory хранилище не работает
    // Используем только Redis
    if (url) {
      console.log(`[s/[slug]] Found in Redis: ${slug}`);
    } else {
      console.log(`[s/[slug]] Not found in Redis: ${slug}`);
    }

    if (!url) {
      console.log(`[s/[slug]] Not found: ${slug}`);
      return res.status(404).json({ error: "Short link not found" });
    }

    // Валидация URL перед редиректом
    try {
      new URL(url);
    } catch (error) {
      console.error(`[s/[slug]] Invalid URL in store: ${url}`, error);
      return res.status(500).json({ error: "Invalid URL in database" });
    }

    console.log(`[s/[slug]] Redirecting ${slug} to ${url}`);
    // Редирект на оригинальный URL
    return res.redirect(302, url);
  } catch (error: any) {
    console.error(`[s/[slug]] Handler error:`, error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error?.message || String(error)
    });
  }
}
