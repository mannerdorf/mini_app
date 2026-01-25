import { getAiReply } from "../lib/ai-service.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { messages, context } = req.body;
        const reply = await getAiReply(messages || [], context);
        res.status(200).json({ reply });
    } catch (err: any) {
        console.error("AI handler error:", err);
        res.status(500).json({ 
            reply: "Извините, у меня возникли технические сложности.",
            error: err?.message
        });
    }
}
