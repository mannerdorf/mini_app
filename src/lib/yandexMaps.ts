/**
 * Yandex Maps helpers for guest warehouse embeds.
 *
 * Important: do NOT pass `text=` into the map-widget URL. That switches the
 * iframe into address-search mode («N найдено») and hides/overrides the `pt`
 * placemark — which is exactly how wrong warehouse pins appear.
 *
 * Key: VITE_YANDEX_MAPS_API_KEY (optional; Maps JS / HTTP Геокодер).
 * Vite inlines it at build time — changing .env alone is not enough without rebuild.
 */

export function resolveYandexMapsApiKey(): string {
  return String(import.meta.env.VITE_YANDEX_MAPS_API_KEY || "").trim();
}

type MapEmbedOpts = {
  lat: number;
  lon: number;
  /** Kept for call-site compatibility; not used in embed URL (avoids search mode). */
  address?: string;
  zoom?: number;
};

function appendApiKey(url: URL): void {
  const key = resolveYandexMapsApiKey();
  if (key) url.searchParams.set("apikey", key);
}

/** Встроенный виджет Яндекс.Карт с меткой по точным координатам склада. */
export function yandexMapEmbedUrl({ lat, lon, zoom = 16 }: MapEmbedOpts): string {
  const url = new URL("https://yandex.ru/map-widget/v1/");
  // ll / pt: longitude,latitude
  url.searchParams.set("ll", `${lon},${lat}`);
  url.searchParams.set("z", String(zoom));
  // pm2rdm = large red placemark
  url.searchParams.set("pt", `${lon},${lat},pm2rdm`);
  appendApiKey(url);
  return url.toString();
}

/** Ссылка «Открыть в Картах» на точку склада (без текстового поиска). */
export function yandexMapsOpenUrl(opts: { lat: number; lon: number; address?: string }): string {
  const url = new URL("https://yandex.ru/maps/");
  url.searchParams.set("ll", `${opts.lon},${opts.lat}`);
  url.searchParams.set("pt", `${opts.lon},${opts.lat},pm2rdm`);
  url.searchParams.set("z", "16");
  url.searchParams.set("l", "map");
  appendApiKey(url);
  return url.toString();
}
