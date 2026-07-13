/** Debug-блок запрос/ответ для синхронизации справочников из CMS. */

export function buildCacheRefreshDebugResponse(status: number, text: string, data: Record<string, unknown>): string {
  if (!text) return `HTTP ${status}\n{}`;
  if (typeof data === "object" && Object.keys(data).length > 0) {
    return `HTTP ${status}\n${JSON.stringify(data, null, 2)}`;
  }
  return `HTTP ${status}\n${text}`;
}

export function resolveUpstreamCurl(
  data: Record<string, unknown>,
  internalCurl: string,
): string {
  const upstreamCurl = typeof data.upstream_curl === "string" ? data.upstream_curl : "";
  const upstreamUrl = typeof data.upstream_url === "string" ? data.upstream_url : "";
  if (upstreamCurl) return upstreamCurl;
  if (upstreamUrl) return `curl --location '${upstreamUrl}'`;
  return internalCurl;
}

export function buildSyncDebugFromResponse(
  status: number,
  text: string,
  data: Record<string, unknown>,
  internalCurl: string,
  upstreamCurlFallback?: string,
): { debugRequest: string; debugResponse: string } {
  return {
    debugRequest: resolveUpstreamCurl(data, upstreamCurlFallback || internalCurl),
    debugResponse: buildCacheRefreshDebugResponse(status, text, data),
  };
}

export function buildSyncDebugFromError(internalCurl: string, message: string): { debugRequest: string; debugResponse: string } {
  return {
    debugRequest: internalCurl,
    debugResponse: `Ошибка: ${message || "Неизвестная ошибка"}`,
  };
}
