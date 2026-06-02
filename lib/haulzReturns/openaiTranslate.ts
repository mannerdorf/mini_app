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
    if (out.some(Boolean)) return out;
  }

  // {"0":"...", "1":"..."} без обёртки translations
  const direct: string[] = [];
  for (let i = 0; i < expectedLen; i++) {
    direct.push(String(obj[String(i)] ?? "").trim());
  }
  if (direct.some(Boolean)) return direct;

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
            "You translate product/item descriptions from English to Russian ONLY (never Russian to English).",
            "Rules:",
            "1) Direction is English → Russian only. NEVER translate Russian/Cyrillic text into English.",
            "2) If the input is entirely in Russian (Cyrillic only, no English words), return it unchanged.",
            "3) For mixed Russian+English text, translate only the English words/phrases to Russian; keep existing Russian text as-is.",
            "4) Keep brand names, model numbers, article codes, and size markers (O/S, 104, 25W) in Latin when they are not common English words.",
            "5) Do not leave English product words untranslated — translate them to proper Russian nouns/adjectives.",
            'Return JSON only: {"translations": string[]} — same length and order as the input array, no extra keys.',
          ].join("\n"),
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
