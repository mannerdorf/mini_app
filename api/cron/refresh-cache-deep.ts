import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleRefreshCacheDeep } from "./_refreshCacheChunk.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleRefreshCacheDeep(req, res);
}
