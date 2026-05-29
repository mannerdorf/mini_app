/** На Vercel serverless прямой запрос в 1С часто даёт 504; данные — из cache_* (крон). */
export function isVercelDeployment(): boolean {
  return process.env.VERCEL === "1";
}

/** true = не вызывать 1С с Vercel (только кэш Postgres). ALLOW_VERCEL_1C=1 — отключить защиту. */
export function preferCacheOnlyOnVercel(): boolean {
  if (!isVercelDeployment()) return false;
  return String(process.env.ALLOW_VERCEL_1C ?? "").trim() !== "1";
}
