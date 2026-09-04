import { resolveApiOrigin } from "./resolveApiOrigin";

/** Относительный /api/* → абсолютный URL с учётом resolveApiOrigin. */
export function toAbsoluteApiUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  const origin = resolveApiOrigin().replace(/\/+$/, "");
  if (!origin) return path;
  if (typeof window !== "undefined") {
    const page = String(window.location.origin || "").replace(/\/+$/, "");
    if (page && page === origin) return path;
  }
  return `${origin}${path}`;
}
