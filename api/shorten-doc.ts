import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

// Используем Upstash Redis для хранения токенов документов
const TOKEN_MAX_AGE = 60 * 60; // 1 час в секундах

async function setRedis(key: string, value: string, ttl: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("Upstash Redis not configured for doc tokens");
    return false;
  }

  try {
    // Upstash REST API формат: POST с командой в body
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
    console.log(`[shorten-doc] Redis SET response:`, JSON.stringify(data));
    
    // Upstash pipeline возвращает массив результатов
    // Формат: [{result: "OK"}, {result: 1}] или [{result: "OK", error: null}, ...]
    const firstResult = Array.isArray(data) ? data[0] : data;
    const setResult = firstResult?.result === "OK" || firstResult?.result === true;
    
    if (!setResult) {
      console.error(`[shorten-doc] Redis SET failed for key ${key}:`, JSON.stringify(data));
    } else {
      console.log(`[shorten-doc] Redis SET successful for key ${key}`);
    }
    
    return setResult;
  } catch (error) {
    console.error("Redis set error:", error);
    return false;
  }
}

// Fallback in-memory хранилище
const docTokenStore = new Map<
  string,
  {
    login: string;
    password: string;
    metod: string;
    number: string;
    createdAt: number;
  }
>();

/**
 * Создает короткую ссылку для документа с временным токеном
 * POST /api/shorten-doc
 * Body: { login, password, metod, number }
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

    const { login, password, metod, number } = body || {};

    if (!login || !password || !metod || !number) {
      return res.status(400).json({
        error: "Required fields: login, password, metod, number",
      });
    }

    // Создаем уникальный токен
    const token = crypto.randomBytes(16).toString("hex");
    const redisKey = `doc:${token}`;

    console.log(`[shorten-doc] Creating token: ${token.substring(0, 8)}... for ${metod} ${number}`);

    // Сохраняем данные документа в Redis
    const docData = JSON.stringify({ login, password, metod, number });
    const saved = await setRedis(redisKey, docData, TOKEN_MAX_AGE);
    
    if (!saved) {
      console.warn(`[shorten-doc] Failed to save to Redis, using fallback (not persistent)`);
      // Fallback: сохраняем в память (не персистентно)
      docTokenStore.set(token, {
        login,
        password,
        metod,
        number,
        createdAt: Date.now(),
      });
    } else {
      console.log(`[shorten-doc] Successfully saved token to Redis: ${redisKey}`);
    }

    // Определяем базовый URL для токена
    const host = req.headers.host || req.headers["x-forwarded-host"];
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const tokenUrl = `${protocol}://${host}/api/doc/${token}`;

    // Создаем короткую ссылку через TinyURL
    let shortUrl = tokenUrl; // Fallback на прямую ссылку
    const apiToken = process.env.TINYURL_API_TOKEN;

    if (apiToken) {
      try {
        const tinyRes = await fetch("https://api.tinyurl.com/dev/api/v1/create", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: tokenUrl,
            domain: "tinyurl.com",
          }),
        });

        if (tinyRes.ok) {
          const tinyData = await tinyRes.json();
          shortUrl = tinyData.data.tiny_url;
          console.log(`[shorten-doc] TinyURL short URL created: ${shortUrl}`);
        } else {
          const errText = await tinyRes.text();
          console.warn(`[shorten-doc] TinyURL failed: ${tinyRes.status} ${errText}`);
        }
      } catch (e) {
        console.warn(`[shorten-doc] TinyURL fetch exception:`, e);
      }
    } else {
      console.warn(`[shorten-doc] TINYURL_API_TOKEN not configured, using direct token URL`);
    }

    return res.status(200).json({
      shortUrl,
      token,
      originalUrl: tokenUrl,
    });
  } catch (error: any) {
    console.error("Shorten doc error:", error);
    return res.status(500).json({
      error: "Failed to create short URL",
      message: error?.message || String(error),
    });
  }
}

/**
 * Экспортируем хранилище для использования в редиректе
 */
export { docTokenStore };
