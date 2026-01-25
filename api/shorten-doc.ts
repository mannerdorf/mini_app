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
    return data[0]?.result === "OK";
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

    // Сохраняем данные документа в Redis
    const docData = JSON.stringify({ login, password, metod, number });
    const saved = await setRedis(`doc:${token}`, docData, TOKEN_MAX_AGE);
    
    if (!saved) {
      // Fallback: сохраняем в память (не персистентно)
      docTokenStore.set(token, {
        login,
        password,
        metod,
        number,
        createdAt: Date.now(),
      });
    }

    // Определяем базовый URL
    const host = req.headers.host || req.headers["x-forwarded-host"];
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const shortUrl = `${protocol}://${host}/api/doc/${token}`;

    return res.status(200).json({
      shortUrl,
      token,
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
