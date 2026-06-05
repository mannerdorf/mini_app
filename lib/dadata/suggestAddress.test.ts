import { describe, expect, it } from "vitest";
import { normalizeDadataSuggestResponse } from "./suggestAddress.js";

describe("dadata suggestAddress", () => {
  it("falls back to value when street is missing", () => {
    const items = normalizeDadataSuggestResponse({
      suggestions: [{ value: "г Калининград, ул Ленина, д 5" }],
    });
    expect(items[0].label).toBe("г Калининград, ул Ленина, д 5");
  });
});
