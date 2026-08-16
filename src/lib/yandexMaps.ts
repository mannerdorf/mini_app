/**
 * Yandex Maps helpers for guest warehouse embeds.
 * Key: VITE_YANDEX_MAPS_API_KEY (JavaScript API / HTTP Геокодер в кабинете developer.tech.yandex.ru).
 */

export function resolveYandexMapsApiKey(): string {
  const key = String(import.meta.env.VITE_YANDEX_MAPS_API_KEY || "").trim();
  return key;
}

type MapEmbedOpts = {
  lat: number;
  lon: number;
  /** Адрес для текстового поиска в виджете (точнее прибивает точку). */
  address?: string;
  zoom?: number;
};

function appendApiKey(url: URL): void {
  const key = resolveYandexMapsApiKey();
  if (key) url.searchParams.set("apikey", key);
}

/** Встроенный виджет Яндекс.Карт с меткой склада. */
export function yandexMapEmbedUrl({ lat, lon, address, zoom = 16 }: MapEmbedOpts): string {
  const url = new URL("https://yandex.ru/map-widget/v1/");
  url.searchParams.set("ll", `${lon},${lat}`);
  url.searchParams.set("z", String(zoom));
  url.searchParams.set("pt", `${lon},${lat},pm2rdm`);
  if (address?.trim()) {
    url.searchParams.set("text", address.trim());
  }
  appendApiKey(url);
  return url.toString();
}

/** Ссылка «Открыть в Картах» на точку склада. */
export function yandexMapsOpenUrl(opts: { lat: number; lon: number; address?: string }): string {
  const url = new URL("https://yandex.ru/maps/");
  url.searchParams.set("pt", `${opts.lon},${opts.lat}`);
  url.searchParams.set("z", "16");
  url.searchParams.set("l", "map");
  if (opts.address?.trim()) {
    url.searchParams.set("text", opts.address.trim());
  }
  appendApiKey(url);
  return url.toString();
}
