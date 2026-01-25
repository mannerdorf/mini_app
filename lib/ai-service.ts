import OpenAI from "openai";

export async function getAiReply(messages: any[], context?: any) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return "Ошибка конфигурации: API ключ не найден.";

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

    try {
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
            ],
            temperature: 0.7,
            max_tokens: 500,
        });
        return completion.choices[0].message.content;
    } catch (err: any) {
        console.error("OpenAI error:", err);
        return "Извините, сейчас я не могу ответить. Попробуйте позже.";
    }
}
