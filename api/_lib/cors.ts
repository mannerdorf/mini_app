import type { VercelRequest, VercelResponse } from "@vercel/node";

/** CORS для фронта на Layero / haulz.ru → API на *.vercel.app */
export const API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Request-Id, X-Login, X-Password",
  "Access-Control-Max-Age": "86400",
};

export function applyApiCors(res: VercelResponse): void {
  for (const [key, value] of Object.entries(API_CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

/** true = ответ уже отправлен (OPTIONS preflight). */
export function respondCorsPreflight(req: VercelRequest, res: VercelResponse): boolean {
  applyApiCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
