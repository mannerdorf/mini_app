import { resolveApiOrigin } from "../../lib/resolveApiOrigin";

function toAbsoluteApiUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  // Preview/Production на Vercel: всегда боевой API (VPS), иначе Functions дают 404/405.
  // Для submit-1c тоже форсим VPS — nested /api/orders/* на Vercel ломается.
  if (typeof window !== "undefined") {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host === "vercel.app" || host.endsWith(".vercel.app")) {
      return `https://haulz.space${path}`;
    }
  }

  const origin = resolveApiOrigin().replace(/\/+$/, "");

  // Оформление в 1С: nested /api/orders/* на Vercel → 405; абсолютный URL через resolveApiOrigin.
  if (
    path === "/api/orders/submit-1c" ||
    path === "/api/documents/order-submit-1c" ||
    path === "/api/order-submit-1c"
  ) {
    const apiOrigin = origin || "https://api.haulz.space";
    return `${apiOrigin}${path}`;
  }

  if (!origin) return path;
  if (typeof window !== "undefined") {
    const page = String(window.location.origin || "").replace(/\/+$/, "");
    if (page && page === origin) return path;
  }
  return `${origin}${path}`;
}

/**
 * POST JSON с явным методом через XHR.
 * URL резолвится через resolveApiOrigin (Vercel preview → haulz.space API).
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
