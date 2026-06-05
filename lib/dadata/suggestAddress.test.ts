import { describe, expect, it, vi, afterEach } from "vitest";
import { dadataSuggestAddresses, normalizeDadataSuggestResponse } from "./suggestAddress.js";

describe("dadata suggestAddress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to value when street is missing", () => {
    const items = normalizeDadataSuggestResponse({
      suggestions: [{ value: "г Калининград, ул Ленина, д 5" }],
    });
    expect(items[0].label).toBe("г Калининград, ул Ленина, д 5");
  });

  it("kaliningrad scope searches whole region with city boost", async () => {
    vi.stubEnv("DADATA_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await dadataSuggestAddresses("гурьев", { city: "kaliningrad" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.locations).toEqual([{ region: "Калининградская" }]);
    expect(body.locations_boost).toEqual([{ city: "Калининград" }]);
  });
});
