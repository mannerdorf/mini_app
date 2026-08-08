import { afterEach, describe, expect, it } from "vitest";
import { chunkTextsForYandex, resolveYandexTranslateApiKey } from "./yandexTranslate";

describe("resolveYandexTranslateApiKey", () => {
  const prev = process.env.YANDEX_TRANSLATE_API_KEY;

  afterEach(() => {
    if (prev == null) delete process.env.YANDEX_TRANSLATE_API_KEY;
    else process.env.YANDEX_TRANSLATE_API_KEY = prev;
  });

  it("reads YANDEX_TRANSLATE_API_KEY", () => {
    process.env.YANDEX_TRANSLATE_API_KEY = " test-key ";
    expect(resolveYandexTranslateApiKey()).toBe("test-key");
  });
});

describe("chunkTextsForYandex", () => {
  it("splits by max text count", () => {
    const texts = Array.from({ length: 120 }, (_, i) => `item-${i}`);
    const batches = chunkTextsForYandex(texts, 100, 9500);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(20);
  });

  it("splits by max char count", () => {
    const texts = ["a".repeat(5000), "b".repeat(5000), "c"];
    const batches = chunkTextsForYandex(texts, 100, 9500);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1);
    expect(batches[1]).toHaveLength(2);
  });
});
