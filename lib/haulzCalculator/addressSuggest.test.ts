import { describe, expect, it } from "vitest";
import { normalizeSuggestResponse } from "./addressSuggest.js";

describe("addressSuggest", () => {
  it("normalizeSuggestResponse maps 2GIS items", () => {
    const items = normalizeSuggestResponse({
      result: {
        items: [
          {
            id: "abc",
            name: "Ленинский пр.",
            full_address_name: "Россия, Москва, Ленинский проспект",
            point: { lat: 55.7, lon: 37.5 },
          },
        ],
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0].fullAddress).toContain("Москва");
    expect(items[0].point?.lat).toBe(55.7);
  });
});
