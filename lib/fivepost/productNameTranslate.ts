import { translateProductNamesEnToRu } from "../haulzReturns/openaiTranslate.js";
import { resolveOpenaiApiKey } from "../haulzReturns/openaiEnv.js";
import { itogTextNeedsTranslation, translationLooksSuccessful } from "../haulzReturns/textLanguage.js";
import { resolveYandexTranslateApiKey, translateTextsToRuYandex } from "./yandexTranslate.js";

export type ProductNameTranslator = "yandex" | "openai";

export function resolveProductNameTranslator(): ProductNameTranslator | null {
  if (resolveYandexTranslateApiKey()) return "yandex";
  if (resolveOpenaiApiKey()) return "openai";
  return null;
}

export function requireProductNameTranslator(): ProductNameTranslator {
  const provider = resolveProductNameTranslator();
  if (!provider) {
    throw new Error(
      "Настройте YANDEX_TRANSLATE_API_KEY или OPENAI_API_KEY на сервере API",
    );
  }
  return provider;
}

/** Перевод названий товаров en→ru: приоритет Yandex (работает из РФ), fallback OpenAI. */
export async function translateProductNamesToRu(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const provider = requireProductNameTranslator();
  let results = provider === "yandex" ? await translateTextsToRuYandex(texts) : await translateProductNamesEnToRu(texts);

  const openaiKey = resolveOpenaiApiKey();
  if (!openaiKey) return results;

  const retryIndexes: number[] = [];
  texts.forEach((text, idx) => {
    if (itogTextNeedsTranslation(text) && !translationLooksSuccessful(text, results[idx] ?? "")) {
      retryIndexes.push(idx);
    }
  });
  if (retryIndexes.length === 0) return results;

  const retryTexts = retryIndexes.map((idx) => texts[idx]);
  const retryResults = await translateProductNamesEnToRu(retryTexts);
  results = [...results];
  retryIndexes.forEach((origIdx, j) => {
    const candidate = retryResults[j]?.trim();
    if (candidate && translationLooksSuccessful(texts[origIdx], candidate)) {
      results[origIdx] = candidate;
    }
  });

  return results;
}
