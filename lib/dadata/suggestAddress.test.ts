import { describe, expect, it, vi, afterEach } from "vitest";
import {
  dadataPointFromSuggestion,
  dadataSuggestAddresses,
  normalizeDadataSuggestResponse,
} from "./suggestAddress.js";

describe("dadata suggestAddress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes point from DaData geo_lat/lon for street-level qc_geo", () => {
    const items = normalizeDadataSuggestResponse({
      suggestions: [
        {
          unrestricted_value: "238755, Калининградская обл, г Зеленоградск, ул Крылова",
          value: "г Зеленоградск, ул Крылова",
          data: {
            fias_id: "abc-123",
            geo_lat: "54.9581",
            geo_lon: "20.4765",
            qc_geo: "2",
            street: "Крылова",
          },
        },
      ],
    });
    expect(items[0].point).toEqual({ lat: 54.9581, lon: 20.4765 });
    expect(items[0].id).toBe("abc-123");
  });

  it("skips point when qc_geo is too coarse", () => {
    expect(
      dadataPointFromSuggestion({
        value: "Калининград городской округ",
        data: { geo_lat: "54.71", geo_lon: "20.45", qc_geo: "4" },
      }),
    ).toBeUndefined();
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
