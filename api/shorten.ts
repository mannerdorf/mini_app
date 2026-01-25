import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

// In-memory хранилище для коротких ссылок
// В production лучше использовать Vercel KV или другую БД
const urlStore = new Map<string, { url: string; createdAt: number }>();

// Очистка старых записей (старше 7 дней)
const CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 дней
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 дней

function cleanupOldEntries() {
  const now = Date.now();
  for (const [slug, entry] of urlStore.entries()) {
    if (now - entry.createdAt > MAX_AGE) {
      urlStore.delete(slug);
    }
  }
}

// Периодическая очистка (каждые 7 дней)
if (typeof setInterval !== "undefined") {
  setInterval(cleanupOldEntries, CLEANUP_INTERVAL);
}

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

    // Сохраняем в хранилище
    urlStore.set(slug, {
      url,
      createdAt: Date.now(),
    });

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
