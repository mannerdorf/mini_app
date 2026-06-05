import { getDadataApiKey } from "./findPartyByInn.js";

const DADATA_GEOLOCATE_URL =
  "https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address";

export type GeolocateAddressResult = {
  label: string;
  fullAddress: string;
  point: { lat: number; lon: number };
};

/** Обратное геокодирование (координаты → адрес) через DaData. */
export async function dadataGeolocateAddress(
  point: { lat: number; lon: number },
  radiusMeters = 80,
): Promise<GeolocateAddressResult | null> {
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const apiKey = getDadataApiKey();
  const res = await fetch(DADATA_GEOLOCATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${apiKey}`,
    },
    body: JSON.stringify({ lat, lon, radius_meters: radiusMeters, count: 1 }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    suggestions?: Array<{ value?: string; unrestricted_value?: string }>;
    message?: string;
  };

  if (!res.ok) return null;

  const row = data.suggestions?.[0];
  const fullAddress = String(row?.unrestricted_value || row?.value || "").trim();
  if (!fullAddress) return null;

  return {
    label: fullAddress,
    fullAddress,
    point: { lat, lon },
  };
}
