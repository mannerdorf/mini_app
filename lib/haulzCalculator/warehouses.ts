import type { CityCode, GeoPoint } from "./types.js";

export type HaulzWarehouse = {
  code: string;
  label: string;
  fullAddress: string;
  hours: string;
  phone: string;
  email: string;
  /** Координаты склада (WGS84), для режима «со склада / на складе». */
  point: GeoPoint;
};

export const HAULZ_WAREHOUSES: Record<CityCode, HaulzWarehouse> = {
  moscow: {
    code: "WH_MSK",
    label: "Склад HAULZ, Москва",
    fullAddress:
      "территория Индустриальный парк Андреевское, вл14А, деревня Андреевское, Ленинский городской округ, Московская область",
    hours: "ежедневно 09:00–18:00",
    phone: "+7 (958) 538-42-22",
    email: "Info@haulz.pro",
    // Индустриальный парк «Андреевское», вл. 14А (Ленинский ГО)
    point: { lat: 55.55034, lon: 37.90994 },
  },
  kaliningrad: {
    code: "WH_KGD",
    label: "Склад HAULZ, Калининград",
    fullAddress: "Железнодорожная улица, 12к4, Калининград, 236039",
    hours: "ежедневно 09:00–18:00",
    phone: "+7 (401) 227-95-55",
    email: "Info@haulz.pro",
    // Железнодорожная ул., 12к4 (здание 12 / логистический корпус)
    point: { lat: 54.68866, lon: 20.50788 },
  },
};

export function warehouseForCity(city: CityCode): HaulzWarehouse {
  return HAULZ_WAREHOUSES[city];
}

export function warehouseHubRows(): Array<{
  code: string;
  name: string;
  lat: number;
  lon: number;
  role: CityCode;
}> {
  return (Object.keys(HAULZ_WAREHOUSES) as CityCode[]).map((city) => {
    const w = HAULZ_WAREHOUSES[city];
    return { code: w.code, name: w.label, lat: w.point.lat, lon: w.point.lon, role: city };
  });
}
