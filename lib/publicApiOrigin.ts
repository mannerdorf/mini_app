import { DEFAULT_APP_URL, DEFAULT_PUBLIC_API_ORIGIN } from "./haulzDomains.js";

function normalizeOrigin(value: string): string {
  let v = value.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `https://${v.replace(/^\/+/, "")}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/** Публичный URL фронта (haulz.space). */
export function getAppPublicUrl(): string {
  const explicit = [process.env.NEXT_PUBLIC_APP_URL, process.env.APP_URL]
    .map((s) => normalizeOrigin(String(s || "")))
    .find(Boolean);
  return explicit || DEFAULT_APP_URL;
}

/** Публичный URL API (api.haulz.space). Webhooks, partner API, track-ссылки. */
export function getPublicApiOrigin(): string {
  const explicit = [
    process.env.PUBLIC_API_ORIGIN,
    process.env.HAULZ_PUBLIC_API_ORIGIN,
    process.env.VITE_API_ORIGIN,
    process.env.API_ORIGIN,
  ]
    .map((s) => normalizeOrigin(String(s || "")))
    .find(Boolean);
  if (explicit) return explicit;

  if (process.env.VERCEL === "1") {
    const vercelHost = String(process.env.VERCEL_URL || "").trim();
    if (vercelHost) {
      return normalizeOrigin(vercelHost.startsWith("http") ? vercelHost : `https://${vercelHost}`);
    }
  }

  return DEFAULT_PUBLIC_API_ORIGIN;
}

type RequestLikeHeaders = {
  host?: string | string[];
  "x-forwarded-host"?: string | string[];
  "x-forwarded-proto"?: string | string[];
};

/** Origin API из env или заголовков запроса (nginx → api.haulz.space). */
export function resolvePublicApiOriginFromRequest(headers: RequestLikeHeaders): string {
  const fromEnv = [
    process.env.PUBLIC_API_ORIGIN,
    process.env.HAULZ_PUBLIC_API_ORIGIN,
    process.env.VITE_API_ORIGIN,
    process.env.API_ORIGIN,
  ]
    .map((s) => normalizeOrigin(String(s || "")))
    .find(Boolean);
  if (fromEnv) return fromEnv;

  const host = String(headers["x-forwarded-host"] || headers.host || "").trim();
  const proto = String(headers["x-forwarded-proto"] || "https").trim();
  if (host) return normalizeOrigin(`${proto}://${host}`);

  return getPublicApiOrigin();
}

export { DEFAULT_PUBLIC_API_ORIGIN, DEFAULT_APP_URL };
