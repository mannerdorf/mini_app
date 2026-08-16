import { describe, expect, it } from "vitest";
import { yandexMapEmbedUrl, yandexMapsOpenUrl } from "./yandexMaps";

describe("yandexMaps", () => {
  it("embed URL pins coordinates and never enters text-search mode", () => {
    const url = new URL(
      yandexMapEmbedUrl({
        lat: 55.55034,
        lon: 37.90994,
        address: "территория Индустриальный парк Андреевское, вл14А",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://yandex.ru/map-widget/v1/");
    expect(url.searchParams.get("ll")).toBe("37.90994,55.55034");
    expect(url.searchParams.get("pt")).toBe("37.90994,55.55034,pm2rdm");
    expect(url.searchParams.get("z")).toBe("16");
    expect(url.searchParams.has("text")).toBe(false);
  });

  it("open URL uses placemark coordinates without text search", () => {
    const url = new URL(
      yandexMapsOpenUrl({
        lat: 54.68866,
        lon: 20.50788,
        address: "Железнодорожная улица, 12к4, Калининград",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://yandex.ru/maps/");
    expect(url.searchParams.get("pt")).toBe("20.50788,54.68866,pm2rdm");
    expect(url.searchParams.has("text")).toBe(false);
  });
});
