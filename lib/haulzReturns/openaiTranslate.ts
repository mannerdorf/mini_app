import OpenAI from "openai";
import { requireOpenaiApiKey } from "./openaiEnv.js";

const DEFAULT_MODEL = "gpt-4o-mini";

export function parseTranslationsJson(raw: string, expectedLen: number): string[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = (fenced?.[1] ?? trimmed).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Не удалось разобрать ответ переводчика");
  }

  if (Array.isArray(parsed)) {
    const out = parsed.map((t) => String(t ?? "").trim());
    while (out.length < expectedLen) out.push("");
    return out.slice(0, expectedLen);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Неверный формат ответа переводчика");
  }

  const obj = parsed as Record<string, unknown>;
  const candidate = obj.translations ?? obj.items ?? obj.results ?? obj.data;
  if (Array.isArray(candidate)) {
    const out = candidate.map((t) => String(t ?? "").trim());
    while (out.length < expectedLen) out.push("");
    return out.slice(0, expectedLen);
  }

  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const out: string[] = [];
    for (let i = 0; i < expectedLen; i++) {
      out.push(String((candidate as Record<string, unknown>)[String(i)] ?? "").trim());
    }
    return out;
  }

  throw new Error("Неверный формат ответа переводчика");
}

export async function translateProductNamesEnToRu(texts: string[], model = DEFAULT_MODEL): Promise<string[]> {
  if (texts.length === 0) return [];

  const apiKey = requireOpenaiApiKey();
  const client = new OpenAI({ apiKey });

  try {
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
    return parseTranslationsJson(raw, texts.length);
  } catch (error: unknown) {
    if (error instanceof OpenAI.APIError) {
      throw new Error(`OpenAI: ${error.message}`);
    }
    throw error;
  }
}
