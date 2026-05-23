import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { normalizeVehicleText, queryCargoNumbersByVehicleInPeriod } from "../lib/sendingsMetrics.js";
import { initRequestContext, logError } from "./_lib/observability.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "cargo-transport-filter");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const {
    vehicle,
    dateFrom,
    dateTo,
    serviceMode,
  } = body || {};

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!vehicle || typeof vehicle !== "string") {
    return res.status(400).json({ error: "vehicle is required", request_id: ctx.requestId });
  }
  if (!dateRe.test(String(dateFrom ?? "")) || !dateRe.test(String(dateTo ?? ""))) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)", request_id: ctx.requestId });
  }
  if (!serviceMode) {
    return res.status(403).json({ error: "serviceMode required", request_id: ctx.requestId });
  }

  const vehicleNormalized = normalizeVehicleText(vehicle);
  if (!vehicleNormalized) {
    return res.status(200).json({ cargoNumbers: [], vehicleNormalized: "" });
  }

  try {
    const pool = getPool();
    const cargoNumbers = await queryCargoNumbersByVehicleInPeriod(
      pool,
      vehicleNormalized,
      String(dateFrom),
      String(dateTo),
    );
    return res.status(200).json({ cargoNumbers, vehicleNormalized });
  } catch (e) {
    logError(ctx, "cargo_transport_filter_failed", e);
    return res.status(500).json({ error: "Ошибка чтения привязок перевозок", request_id: ctx.requestId });
  }
}
