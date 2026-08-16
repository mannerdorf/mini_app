import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { initRequestContext, logError, logInfo } from "./_lib/observability.js";
import {
  authorizeServiceRefreshFrom1c,
  refreshDocumentCacheFrom1c,
  type ServiceRefreshKind,
} from "../lib/serviceRefreshFrom1c.js";

const ALLOWED_KINDS: ServiceRefreshKind[] = ["perevozki", "invoices", "acts", "sendings", "orders"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "service-refresh-from-1c");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: any = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body", request_id: ctx.requestId });
    }
  }

  const dateFrom = String(body?.dateFrom ?? "").trim();
  const dateTo = String(body?.dateTo ?? "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) {
    return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)", request_id: ctx.requestId });
  }
  if (dateFrom > dateTo) {
    return res.status(400).json({ error: "dateFrom > dateTo", request_id: ctx.requestId });
  }

  const rawKinds = Array.isArray(body?.kinds) ? body.kinds : [];
  const kinds = rawKinds
    .map((k: unknown) => String(k ?? "").trim())
    .filter((k: string): k is ServiceRefreshKind => (ALLOWED_KINDS as string[]).includes(k));
  if (kinds.length === 0) {
    return res.status(400).json({ error: "kinds[] required", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const auth = await authorizeServiceRefreshFrom1c(pool, {
      login: body?.login,
      password: body?.password,
      serviceMode: !!body?.serviceMode,
      isRegisteredUser: !!body?.isRegisteredUser,
    });
    if (auth.ok === false) {
      return res.status(auth.status).json({ error: auth.error, request_id: ctx.requestId });
    }
    const results = await refreshDocumentCacheFrom1c(pool, auth.login, auth.password, dateFrom, dateTo, kinds);
    const failed = results.filter((r) => r.error);
    logInfo(ctx, "service_refresh_from_1c_done", { dateFrom, dateTo, kinds, results });

    return res.status(200).json({
      ok: failed.length === 0,
      dateFrom,
      dateTo,
      kinds: results,
      message:
        failed.length === 0
          ? "Данные загружены из 1С и записаны в кэш"
          : `Частично: ошибки — ${failed.map((f) => f.kind).join(", ")}`,
      request_id: ctx.requestId,
    });
  } catch (e: any) {
    logError(ctx, "service_refresh_from_1c_failed", e);
    return res.status(500).json({
      error: e?.message || "Ошибка обновления из 1С",
      request_id: ctx.requestId,
    });
  }
}
