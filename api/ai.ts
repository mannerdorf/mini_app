import type { VercelRequest, VercelResponse } from "@vercel/node";
import chatHandler from "./chat.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const ctx = initRequestContext(req, res, "ai");
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
    }

    try {
        let body: any = req.body;
        if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                body = {};
            }
        }

        const { messages, context, sessionId, userId, message } = body ?? {};
        const userMessage =
            message ||
            (Array.isArray(messages) && messages.length > 0
                ? messages[messages.length - 1]?.content
                : null);

        req.body = {
            sessionId,
            userId,
            message: userMessage,
            context,
        };

        return chatHandler(req, res);
    } catch (err: any) {
        logError(ctx, "ai_handler_failed", err);
        return res.status(500).json({
            reply: "Извините, у меня возникли технические сложности. Попробуйте написать позже.",
            error: err?.message,
            request_id: ctx.requestId,
        });
    }
}
