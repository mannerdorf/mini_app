import { resolveApiOrigin } from "../../lib/resolveApiOrigin";

function toAbsoluteApiUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  const origin = resolveApiOrigin().replace(/\/+$/, "") || "https://api.haulz.space";
  if (typeof window !== "undefined") {
    const page = String(window.location.origin || "").replace(/\/+$/, "");
    if (page && page === origin) return path;
  }
  return `${origin}${path}`;
}

/**
 * POST JSON с явным методом через XHR.
 * URL резолвится через resolveApiOrigin (production → api.haulz.space).
 */
export function postJsonXhr(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; data: unknown; responseText: string; url: string; method: "POST" }> {
  const absoluteUrl = toAbsoluteApiUrl(url);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", absoluteUrl, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === "content-type") continue;
      xhr.setRequestHeader(key, value);
    }
    xhr.onload = () => {
      let data: unknown = {};
      const responseText = String(xhr.responseText || "");
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { raw: responseText };
      }
      resolve({ status: xhr.status, data, responseText, url: absoluteUrl, method: "POST" });
    };
    xhr.onerror = () => reject(new Error(`Network error: POST ${absoluteUrl}`));
    xhr.ontimeout = () => reject(new Error(`Timeout: POST ${absoluteUrl}`));
    xhr.timeout = 120_000;
    xhr.send(body);
  });
}
