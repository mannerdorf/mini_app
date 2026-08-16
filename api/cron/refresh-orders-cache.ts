import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleRefreshOrdersCacheChunk } from "./_refreshCacheChunk.js";

/** Кэш заявок: логика в `_refreshCacheChunk` (чанками). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleRefreshOrdersCacheChunk(req, res);
}
