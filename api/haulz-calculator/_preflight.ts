import type { VercelRequest, VercelResponse } from "@vercel/node";
import { respondCorsPreflight } from "../_lib/cors.js";

/** Маршруты haulz-calculator исключены из Edge middleware — OPTIONS обрабатываем здесь. */
export function haulzCalculatorPreflight(req: VercelRequest, res: VercelResponse): boolean {
  return respondCorsPreflight(req, res);
}
