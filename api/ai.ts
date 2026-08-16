import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext, logError } from "./_lib/observability.js";

/**
 * Legacy /api/ai entrypoint. The dedicated chat handler was removed;
 * keep this route typed and return a stable error instead of a missing import.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const ctx = initRequestContext(req, res, "ai");
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
    }

    try {
        return res.status(410).json({
            reply: "Чат временно недоступен. Используйте актуальный AI-эндпоинт.",
            error: "chat_removed",
            request_id: ctx.requestId,
        });
    } catch (err: any) {
        logError(ctx, "ai_handler_failed", err);
        return res.status(500).json({
            reply: "Извините, у меня возникли технические сложности. Попробуйте написать позже.",
            error: err?.message,
            request_id: ctx.requestId,
        });
    }
}
