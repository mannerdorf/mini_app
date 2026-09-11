import type { VercelRequest, VercelResponse } from "@vercel/node";
import { publicApiPreflight } from "./_preflight.js";
import { initRequestContext } from "../../_lib/observability.js";
import { applyApiCors } from "../../_lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (publicApiPreflight(req, res)) return;
  applyApiCors(res);
  const ctx = initRequestContext(req, res, "public_v1_health");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  return res.status(200).json({
    ok: true,
    version: "1",
    service: "haulz-public-quote",
    routes: ["mow_kgd", "kgd_mow"],
    request_id: ctx.requestId,
  });
}
