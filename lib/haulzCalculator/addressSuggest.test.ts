import { describe, expect, it } from "vitest";
import { normalizeDadataSuggestResponse } from "../dadata/suggestAddress.js";

describe("addressSuggest", () => {
  it("normalizeDadataSuggestResponse maps DaData suggestions", () => {
    const items = normalizeDadataSuggestResponse({
      suggestions: [
        {
          value: "г Москва, ул Сухонская, д 11",
          unrestricted_value: "г Москва, ул Сухонская, д 11",
          data: {
            fias_id: "abc",
            city: "Москва",
            street: "ул Сухонская",
            house: "11",
          },
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].fullAddress).toContain("Москва");
    expect(items[0].label).toContain("Сухонская");
    expect(items[0].id).toBe("abc");
  });
});
