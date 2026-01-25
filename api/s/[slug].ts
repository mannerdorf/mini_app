import type { VercelRequest, VercelResponse } from "@vercel/node";
import { urlStore } from "../shorten";

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

  const entry = urlStore.get(slug);

  if (!entry) {
    return res.status(404).json({ error: "Short link not found" });
  }

  // Редирект на оригинальный URL
  return res.redirect(302, entry.url);
}
