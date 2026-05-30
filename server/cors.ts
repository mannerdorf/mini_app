/** CORS для VPS: заголовки из единого источника lib/apiCorsHeaders.ts */
import { API_CORS_HEADERS } from "../lib/apiCorsHeaders.js";

export const CORS_HEADERS = API_CORS_HEADERS;

export function applyCors(res: import("node:http").ServerResponse): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}
