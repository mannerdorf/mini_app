import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleRefreshCacheChunk } from "./_refreshCacheChunk.js";

/** Кэш документов: логика в `_refreshCacheChunk` (чанками, без таймаута Vercel). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleRefreshCacheChunk(req, res);
}
