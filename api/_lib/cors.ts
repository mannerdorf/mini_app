import type { VercelRequest, VercelResponse } from "@vercel/node";
import { API_CORS_HEADERS } from "../../lib/apiCorsHeaders.js";

export { API_CORS_HEADERS };

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
