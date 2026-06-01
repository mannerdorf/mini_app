import { API_CORS_HEADERS } from "./lib/apiCorsHeaders.js";

/**
 * Vercel Edge Middleware: CORS для лёгких /api/* (haulz.ru → API на Vercel).
 * Тяжёлые маршруты (perevozki, invoices, …) НЕ проходят через middleware:
 * иначе Edge ждёт ответ функции и отдаёт 504, хотя maxDuration функции = 300 с.
 */
export const config = {
    matcher: [
        "/api/((?!cron/|perevozki|invoices|acts|orders|sendings|getperevozka|service-refresh-from-1c|admin-weekly-summary|admin-document-cache-backfill|wb/|haulz-returns/).*)",
    ],
};

const CORS_HEADERS = API_CORS_HEADERS;

export default async function middleware(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const upstream = await fetch(request);
    const headers = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
        headers.set(key, value);
    }
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}
