import { describe, expect, it } from "vitest";
import { prepareSuggestQuery } from "./yandexSuggest.js";

describe("yandex address suggest", () => {
  it("prepareSuggestQuery adds city to street-only input", () => {
    expect(prepareSuggestQuery("ленина 10", "moscow")).toBe("Москва, ленина 10");
    expect(prepareSuggestQuery("Москва, ленина", "moscow")).toBe("Москва, ленина");
    expect(prepareSuggestQuery("Калининград, ", "kaliningrad")).toBe("Калининград");
  });
});
