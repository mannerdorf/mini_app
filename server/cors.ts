/** CORS для фронта haulz.ru → API на VPS 72.56.36.185 (раньше Vercel Edge middleware). */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id, X-Login, X-Password",
  "Access-Control-Max-Age": "86400",
};

export function applyCors(res: import("node:http").ServerResponse): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}
