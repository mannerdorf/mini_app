export type DgisDebugEntry = {
  service: "geocode" | "routing";
  httpStatus: number;
  responseBody: unknown;
};

const KEY_IN_STRING = /key=[^&\s"']+/gi;

export function sanitizeDgisDebugPayload(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(KEY_IN_STRING, "key=***");
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeDgisDebugPayload);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = k === "key" ? "***" : sanitizeDgisDebugPayload(v);
    }
    return out;
  }
  return value;
}

export function dgisErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const root = payload as Record<string, unknown>;
  const err = root.error;
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  if (typeof root.message === "string" && root.message.trim()) {
    return root.message.trim();
  }
  return undefined;
}

export class DgisRouteError extends Error {
  readonly debug: DgisDebugEntry;

  constructor(message: string, debug: DgisDebugEntry) {
    super(message);
    this.name = "DgisRouteError";
    this.debug = debug;
  }
}
