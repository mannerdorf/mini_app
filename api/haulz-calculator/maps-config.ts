import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "../_lib/observability.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";

const CITY_CENTER: Record<string, { lat: number; lon: number; zoom: number }> = {
  moscow: { lat: 55.7558, lon: 37.6173, zoom: 10 },
  kaliningrad: { lat: 54.7104, lon: 20.5103, zoom: 11 },
};

/** @deprecated Карта на Leaflet+OSM; ключ не требуется. Оставлено для совместимости API. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_calculator_maps_config");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  return res.status(200).json({
    mapsApiKey: "",
    cityCenters: CITY_CENTER,
    request_id: ctx.requestId,
  });
}
