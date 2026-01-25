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

  if (!token.trim()) {
    console.warn("[bitly] BITLY_ACCESS_TOKEN is empty or whitespace");
    return null;
  }

  console.log(`[bitly] Token present: YES (length: ${token.length})`);

  try {
    console.log(`[bitly] Shortening URL: ${longUrl}`);
    
    const requestBody = {
      long_url: longUrl,
    };
    
    console.log(`[bitly] Request body:`, JSON.stringify(requestBody));
    console.log(`[bitly] API endpoint: ${BITLY_API_BASE}/shorten`);
    
    const response = await fetch(`${BITLY_API_BASE}/shorten`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[bitly] Response status: ${response.status} ${response.statusText}`);
    console.log(`[bitly] Response headers:`, Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log(`[bitly] Response body (raw):`, responseText.substring(0, 500));

    if (!response.ok) {
      console.error(`[bitly] Shorten failed: ${response.status} ${response.statusText}`);
      console.error(`[bitly] Error response:`, responseText);
      return null;
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[bitly] Failed to parse JSON response:`, parseError);
      console.error(`[bitly] Response text:`, responseText);
      return null;
    }

    console.log(`[bitly] Parsed response:`, JSON.stringify(data, null, 2));
    
    // Bitly API v4 возвращает поле "link" с короткой ссылкой
    const shortUrl = data?.link || data?.id || data?.short_url || data?.url;

    if (shortUrl) {
      console.log(`[bitly] Successfully shortened: ${longUrl.substring(0, 50)}... -> ${shortUrl}`);
      return shortUrl;
    }

    console.error("[bitly] No short URL in response. Available fields:", Object.keys(data));
    console.error("[bitly] Full response:", JSON.stringify(data, null, 2));
    return null;
  } catch (error: any) {
    console.error("[bitly] Shorten error:", error?.message || error);
    console.error("[bitly] Error stack:", error?.stack);
    return null;
  }
}
