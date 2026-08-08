const YANDEX_TRANSLATE_URL = "https://translate.api.cloud.yandex.net/translate/v2/translate";

export function resolveYandexTranslateApiKey(): string {
  return String(
    process.env.YANDEX_TRANSLATE_API_KEY ??
      process.env.YC_TRANSLATE_API_KEY ??
      "",
  ).trim();
}

export function resolveYandexFolderId(): string {
  return String(
    process.env.YANDEX_FOLDER_ID ??
      process.env.YANDEX_CLOUD_FOLDER_ID ??
      "",
  ).trim();
}

export function chunkTextsForYandex(
  texts: string[],
  maxTexts = 100,
  maxChars = 9500,
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;

  for (const text of texts) {
    const len = text.length;
    if (current.length >= maxTexts || (chars + len > maxChars && current.length > 0)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += len;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

type YandexTranslateResponse = {
  translations?: Array<{ text?: string }>;
  message?: string;
  code?: number;
};

async function translateBatchYandex(texts: string[]): Promise<string[]> {
  const apiKey = resolveYandexTranslateApiKey();
  if (!apiKey) {
    throw new Error("YANDEX_TRANSLATE_API_KEY не настроен на сервере API");
  }

  const folderId = resolveYandexFolderId();
  const body: Record<string, unknown> = {
    texts,
    targetLanguageCode: "ru",
  };
  if (folderId) body.folderId = folderId;

  const res = await fetch(YANDEX_TRANSLATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Api-Key ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as YandexTranslateResponse;
  if (!res.ok) {
    const detail = payload.message?.trim() || res.statusText || "unknown error";
    if (res.status === 403 && /permission|denied|resource-manager/i.test(detail)) {
      throw new Error(
        "Yandex Translate: нет прав у API-ключа. В Yandex Cloud → сервисный аккаунт → роли: ai.translate.user (и resource-manager.viewer на каталог). Проверьте YANDEX_FOLDER_ID.",
      );
    }
    throw new Error(`Yandex Translate: ${res.status} ${detail}`);
  }

  const translations = payload.translations ?? [];
  if (translations.length !== texts.length) {
    throw new Error("Yandex Translate: неверное число переводов в ответе");
  }

  return translations.map((item, idx) => item.text?.trim() || texts[idx] || "");
}

/** Перевод списка строк в русский через Yandex Cloud Translate API. */
export async function translateTextsToRuYandex(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const batches = chunkTextsForYandex(texts);
  const out: string[] = [];

  for (const batch of batches) {
    const translated = await translateBatchYandex(batch);
    out.push(...translated);
  }

  return out;
}
