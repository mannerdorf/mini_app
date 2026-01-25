/**
 * Bitly API helper functions
 * Используем Bitly API v4 для создания коротких ссылок
 * 
 * Токен должен быть добавлен в Vercel Environment Variables:
 * - BITLY_ACCESS_TOKEN
 */

const BITLY_API_BASE = "https://api-ssl.bitly.com/v4";

function truncateUrl(u: string, max = 80): string {
  if (!u || u.length <= max) return u;
  return u.slice(0, max) + "...";
}

export type ShortenResult =
  | { ok: true; shortUrl: string }
  | { ok: false; error?: string; status?: number; raw?: string };

export async function shortenUrl(longUrl: string): Promise<ShortenResult> {
  const token = process.env.BITLY_ACCESS_TOKEN;

  if (!token) {
    console.warn("[bitly] BITLY_ACCESS_TOKEN not configured");
    return { ok: false, error: "BITLY_ACCESS_TOKEN not configured" };
  }

  if (!token.trim()) {
    console.warn("[bitly] BITLY_ACCESS_TOKEN is empty or whitespace");
    return { ok: false, error: "BITLY_ACCESS_TOKEN empty" };
  }

  const bitlyUrl = `${BITLY_API_BASE}/shorten`;
  const requestBody = { long_url: longUrl };
  const bodyJson = JSON.stringify(requestBody);

  console.log(`[bitly] ── Запрос в Bitly ──`);
  console.log(`[bitly] Куда: POST ${bitlyUrl}`);
  console.log(`[bitly] Headers: Content-Type=application/json, Authorization=Bearer *** (длина токена: ${token.length})`);
  console.log(`[bitly] Body: ${JSON.stringify({ long_url: truncateUrl(longUrl) })}`);
  console.log(`[bitly] Body (полная длина long_url): ${longUrl.length} символов`);

  try {
    const response = await fetch(bitlyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: bodyJson,
    });

    const responseText = await response.text();

    try {
      const headersObj: Record<string, string> = {};
      response.headers.forEach((v, k) => { headersObj[k] = v; });
      console.log(`[bitly] ── Ответ Bitly ──`);
      console.log(`[bitly] Status: ${response.status} ${response.statusText}`);
      console.log(`[bitly] Headers:`, JSON.stringify(headersObj));
      console.log(`[bitly] Body (raw):`, responseText.substring(0, 500));
    } catch (_) {}

    if (!response.ok) {
      console.error(`[bitly] Shorten failed: ${response.status} ${response.statusText}`);
      console.error(`[bitly] Error response:`, responseText);
      return { ok: false, error: response.statusText || "Bitly error", status: response.status, raw: responseText.slice(0, 500) };
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[bitly] Failed to parse JSON:`, parseError);
      return { ok: false, error: "Invalid Bitly JSON", raw: responseText.slice(0, 500) };
    }

    const shortUrl = data?.link || data?.id || data?.short_url || data?.url;
    if (shortUrl) {
      console.log(`[bitly] Success: ${truncateUrl(longUrl)} -> ${shortUrl}`);
      return { ok: true, shortUrl };
    }

    console.error("[bitly] No short URL in response. Keys:", Object.keys(data));
    return { ok: false, error: "No link in Bitly response", raw: JSON.stringify(data).slice(0, 500) };
  } catch (error: any) {
    console.error("[bitly] Shorten error:", error?.message || error);
    console.error("[bitly] Stack:", error?.stack);
    return { ok: false, error: error?.message || String(error) };
  }
}
