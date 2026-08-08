import { translateProductNamesEnToRu } from "../haulzReturns/openaiTranslate.js";
import { resolveOpenaiApiKey } from "../haulzReturns/openaiEnv.js";
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
  if (provider === "yandex") return translateTextsToRuYandex(texts);
  return translateProductNamesEnToRu(texts);
}
