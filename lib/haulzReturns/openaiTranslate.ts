import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

export async function translateProductNamesEnToRu(texts: string[], model = DEFAULT_MODEL): Promise<string[]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY не настроен");
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Translate product/item descriptions from English to Russian for customs and shipping documents.",
          "Keep brand names, model numbers, article codes, and size markers (e.g. O/S, 104, 25W) unchanged when they are not common English words.",
          "If the text is already in Russian, return it unchanged.",
          'Return JSON only: {"translations": string[]} with the same length and order as the input array.',
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(texts),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { translations?: unknown };
  try {
    parsed = JSON.parse(raw) as { translations?: unknown };
  } catch {
    throw new Error("Не удалось разобрать ответ переводчика");
  }

  if (!Array.isArray(parsed.translations)) {
    throw new Error("Неверный формат ответа переводчика");
  }

  const out = parsed.translations.map((t) => String(t ?? "").trim());
  while (out.length < texts.length) out.push("");
  return out.slice(0, texts.length);
}
