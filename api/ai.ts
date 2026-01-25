import OpenAI from "openai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { messages, context } = req.body;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ reply: "Ошибка конфигурации: API ключ не найден." });
        }

        const client = new OpenAI({ apiKey });

        const systemPrompt = `Ты — умный AI-помощник логистической компании HAULZ.
Твоя задача — помогать клиентам отслеживать их грузы и отвечать на вопросы по логистике.
Отвечай вежливо, профессионально и кратко.

ИНФОРМАЦИЯ О КОМПАНИИ:
- Название: HAULZ (ООО «Холз»)
- Маршруты: Москва – Калининград, Калининград – Москва.
- Услуги: Перевозка грузов, экспедирование, оформление документов (ЭР, Счет, УПД, АПП).
- Особенности: Быстрая доставка, работа с B2B.

КОНТЕКСТ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ:
${context ? JSON.stringify(context, null, 2) : "Пользователь пока не авторизован или данных о перевозках нет."}

ПРАВИЛА ОТВЕТОВ:
1. Если пользователь спрашивает про конкретную перевозку, ищи её в предоставленном контексте.
2. Если данных в контексте нет, вежливо попроси уточнить номер перевозки.
3. Используй смайлики (грузовик, пакет, документы) для дружелюбности, но оставайся профессиональным.
4. Если не знаешь ответа, предложи связаться с оператором.`;

        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                ...(messages || [])
            ],
            temperature: 0.7,
            max_tokens: 500,
        });

        const reply = completion.choices[0].message.content;
        res.status(200).json({ reply });
    } catch (err: any) {
        console.error("AI handler error:", err);
        res.status(500).json({ 
            reply: "Извините, у меня возникли технические сложности. Попробуйте написать позже.",
            error: err?.message
        });
    }
}
