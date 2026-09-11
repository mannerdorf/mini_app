import type { VercelRequest, VercelResponse } from "@vercel/node";
import { respondCorsPreflight } from "../../_lib/cors.js";

export function publicApiPreflight(req: VercelRequest, res: VercelResponse): boolean {
  return respondCorsPreflight(req, res);
}
