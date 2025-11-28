import OpenAI from "openai";

export default async function handler(req, res) {
    try {
        const { message } = req.body;

        const client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY   // ключ хранится на Vercel
        });

        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Ты — AI-логист HAULZ. Отвечай профессионально, кратко и понятно." },
                { role: "user", content: message }
            ]
        });

        res.status(200).json({ reply: completion.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ reply: "Ошибка AI" });
    }
}
