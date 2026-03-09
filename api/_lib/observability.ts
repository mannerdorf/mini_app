import { randomUUID } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export type RequestContext = {
  requestId: string;
  route: string;
  startedAt: number;
};

export function initRequestContext(req: VercelRequest, res: VercelResponse, route: string): RequestContext {
  const headerValue = req.headers["x-request-id"];
  const fromHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const requestId = String(fromHeader || "").trim() || randomUUID();
  res.setHeader("x-request-id", requestId);
  return { requestId, route, startedAt: Date.now() };
}

export function logInfo(ctx: RequestContext, event: string, meta?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      level: "info",
      event,
      route: ctx.route,
      request_id: ctx.requestId,
      duration_ms: Date.now() - ctx.startedAt,
      ...(meta || {}),
    })
  );
}

export function logError(ctx: RequestContext, event: string, error: unknown, meta?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: "error",
      event,
      route: ctx.route,
      request_id: ctx.requestId,
      duration_ms: Date.now() - ctx.startedAt,
      error: message,
      ...(meta || {}),
    })
  );
}
