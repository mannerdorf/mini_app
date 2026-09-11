import type { VercelRequest, VercelResponse } from "@vercel/node";
import { publicApiPreflight } from "./_preflight.js";
import { initRequestContext } from "../../_lib/observability.js";
import { applyApiCors } from "../../_lib/cors.js";
import {
  listPublicMainlineModes,
  PUBLIC_ROUTE_CATALOG,
  publicMainlineModeLabels,
  publicRouteCalculatorUrl,
  publicWarehousesPayload,
} from "../../../lib/haulzCalculator/publicRouteCatalog.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (publicApiPreflight(req, res)) return;
  applyApiCors(res);
  const ctx = initRequestContext(req, res, "public_v1_routes");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  return res.status(200).json({
    routes: PUBLIC_ROUTE_CATALOG.map((route) => ({
      id: route.id,
      direction: route.direction,
      from: route.from,
      to: route.to,
      slug: route.slug,
      path: route.path,
      url: `https://haulz.space${route.path}`,
      calculator_url: `https://haulz.space${publicRouteCalculatorUrl(route.direction)}`,
      summary: route.summary,
      focus: route.focus,
      modes: route.modes,
      cargo: route.cargo,
      stages: route.stages,
      features: route.features,
      faq: route.faq,
    })),
    mainline_modes: listPublicMainlineModes().map((mode) => ({
      mode,
      label: publicMainlineModeLabels()[mode],
    })),
    warehouses: publicWarehousesPayload(),
    request_id: ctx.requestId,
  });
}
