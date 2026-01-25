/**
 * Bitly API helper functions
 * Используем Bitly API v4 для создания коротких ссылок
 * 
 * Токен должен быть добавлен в Vercel Environment Variables:
 * - BITLY_ACCESS_TOKEN
 */

const BITLY_API_BASE = "https://api-ssl.bitly.com/v4";

export async function shortenUrl(longUrl: string): Promise<string | null> {
  const token = process.env.BITLY_ACCESS_TOKEN;

  if (!token) {
    console.warn("[bitly] BITLY_ACCESS_TOKEN not configured");
    return null;
  }

  try {
    console.log(`[bitly] Shortening URL: ${longUrl.substring(0, 100)}...`);
    
    const response = await fetch(`${BITLY_API_BASE}/shorten`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        long_url: longUrl,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[bitly] Shorten failed: ${response.status} ${text}`);
      return null;
    }

    const data = await response.json();
    console.log(`[bitly] Bitly API response:`, JSON.stringify(data));
    
    // Bitly API v4 возвращает поле "link" с короткой ссылкой
    const shortUrl = data?.link || data?.id || data?.short_url;

    if (shortUrl) {
      console.log(`[bitly] Successfully shortened: ${longUrl.substring(0, 50)}... -> ${shortUrl}`);
      return shortUrl;
    }

    console.error("[bitly] No short URL in response:", JSON.stringify(data));
    return null;
  } catch (error: any) {
    console.error("[bitly] Shorten error:", error?.message || error);
    return null;
  }
}
