import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

// Хранилище для токенов документов (временные токены для доступа к документам)
// В production лучше использовать Vercel KV
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

// Очистка старых токенов (старше 1 часа)
const TOKEN_MAX_AGE = 60 * 60 * 1000; // 1 час
const CLEANUP_INTERVAL = 10 * 60 * 1000; // каждые 10 минут

function cleanupOldTokens() {
  const now = Date.now();
  for (const [token, entry] of docTokenStore.entries()) {
    if (now - entry.createdAt > TOKEN_MAX_AGE) {
      docTokenStore.delete(token);
    }
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(cleanupOldTokens, CLEANUP_INTERVAL);
}

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

    // Сохраняем данные документа
    docTokenStore.set(token, {
      login,
      password,
      metod,
      number,
      createdAt: Date.now(),
    });

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
