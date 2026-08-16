import { HAULZ_WAREHOUSES } from "../../../lib/haulzCalculator/warehouses";

export const GUEST_WAREHOUSE_ITEMS = [
  {
    city: "Москва",
    hours: "ежедневно с 09:00-18:00",
    address: HAULZ_WAREHOUSES.moscow.fullAddress,
    phone: HAULZ_WAREHOUSES.moscow.phone,
    email: HAULZ_WAREHOUSES.moscow.email,
    lat: HAULZ_WAREHOUSES.moscow.point.lat,
    lon: HAULZ_WAREHOUSES.moscow.point.lon,
  },
  {
    city: "Калининград",
    hours: "ежедневно с 09:00-18:00",
    address: HAULZ_WAREHOUSES.kaliningrad.fullAddress,
    phone: HAULZ_WAREHOUSES.kaliningrad.phone,
    email: HAULZ_WAREHOUSES.kaliningrad.email,
    lat: HAULZ_WAREHOUSES.kaliningrad.point.lat,
    lon: HAULZ_WAREHOUSES.kaliningrad.point.lon,
  },
] as const;
