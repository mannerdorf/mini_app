import type { Pool } from "pg";
import { buildQuote } from "./quoteEngine.js";
import { warehouseForCity } from "./warehouses.js";
import { citiesForDirection } from "./direction.js";
import { parseMainlineMode } from "./mainlineMode.js";
import type { AddressSelection, Direction, MainlineMode, QuoteRequest } from "./types.js";
import { getPublicRouteByDirection } from "./publicRouteCatalog.js";

export type PublicEstimateInput = {
  direction: Direction;
  weightKg: number;
  volumeM3?: number;
  mode?: MainlineMode;
};

export type PublicEstimateResult = {
  direction: Direction;
  from: string;
  to: string;
  mode: MainlineMode;
  weightKg: number;
  billableWeightKg: number;
  totalRub: number;
  deliveryDays: number;
  pricePerKg: number;
  disclaimer: string;
  calculatorUrl: string;
  routePageUrl: string;
  mainlineOptions: Array<{
    mode: MainlineMode;
    label: string;
    pricePerKg: number;
    estimatedRub: number;
    deliveryDays: number;
  }>;
};

function warehouseAddress(city: "moscow" | "kaliningrad"): AddressSelection {
  const w = warehouseForCity(city);
  return {
    label: w.label,
    fullAddress: w.fullAddress,
    point: w.point,
    city,
    sourceId: w.code,
  };
}

function buildWarehouseToWarehouseRequest(input: PublicEstimateInput): QuoteRequest {
  const { from, to } = citiesForDirection(input.direction);
  const weightKg = Math.max(0.1, Number(input.weightKg) || 0);
  const volumeM3 = input.volumeM3 != null ? Math.max(0.001, Number(input.volumeM3)) : weightKg / 200;
  return {
    from: warehouseAddress(from),
    to: warehouseAddress(to),
    places: [{ weightKg, volumeM3 }],
    mainlineMode: parseMainlineMode(input.mode, "ferry"),
    direction: input.direction,
    declaredValueRub: 0,
    extraCodes: [],
    fromParty: { mode: "point" },
    toParty: { mode: "point" },
  };
}

export async function buildPublicEstimate(pool: Pool, input: PublicEstimateInput): Promise<PublicEstimateResult> {
  const direction = input.direction === "kgd_mow" ? "kgd_mow" : "mow_kgd";
  const mode = parseMainlineMode(input.mode, "ferry");
  const weightKg = Math.max(0.1, Number(input.weightKg) || 0);
  const quoteReq = buildWarehouseToWarehouseRequest({ ...input, direction, weightKg, mode });
  const quote = await buildQuote(pool, quoteReq);
  const route = getPublicRouteByDirection(direction);
  const mainlineLine = quote.lines.find((l) => l.key === "mainline");
  const pricePerKg = Number(mainlineLine?.meta?.pricePerKg) || 0;

  return {
    direction,
    from: route?.from ?? (direction === "mow_kgd" ? "Москва" : "Калининград"),
    to: route?.to ?? (direction === "mow_kgd" ? "Калининград" : "Москва"),
    mode,
    weightKg,
    billableWeightKg: quote.chargeable.mainlineChargeableWeightKg ?? quote.chargeable.chargeableWeightKg,
    totalRub: quote.totalRub,
    deliveryDays: quote.deliveryDays,
    pricePerKg,
    disclaimer:
      "Ориентировочный расчёт «склад — склад» без забора и последней мили. Точная стоимость — в калькуляторе HAULZ с адресами.",
    calculatorUrl: `https://haulz.space/kalkulyator?direction=${direction}`,
    routePageUrl: route ? `https://haulz.space${route.path}` : "https://haulz.space/",
    mainlineOptions: quote.mainlineOptions.map((o) => ({
      mode: o.mode,
      label: o.label,
      pricePerKg: o.pricePerKg,
      estimatedRub: o.estimatedRub,
      deliveryDays: o.deliveryDays,
    })),
  };
}
