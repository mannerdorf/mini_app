import { resolveYandexTranslateApiKey, translateTextsToRuYandex } from "./yandexTranslate.js";

export type ProductNameTranslator = "yandex";

export function resolveProductNameTranslator(): ProductNameTranslator | null {
  if (resolveYandexTranslateApiKey()) return "yandex";
  return null;
}

export function requireProductNameTranslator(): ProductNameTranslator {
  const provider = resolveProductNameTranslator();
  if (!provider) {
    throw new Error("Настройте YANDEX_TRANSLATE_API_KEY на сервере API");
  }
  return provider;
}

/** Перевод названий товаров en→ru только через Yandex Cloud Translate. */
export async function translateProductNamesToRu(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  requireProductNameTranslator();
  return translateTextsToRuYandex(texts);
}
