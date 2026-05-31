import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initRequestContext } from "../api/_lib/observability.js";
import { withErrorLog } from "./requestErrorLog.js";
import { resolvePartnerOrUserApiAuth, type PartnerOrUserAuthResult } from "./partnerOrUserApiAuth.js";
import { assertBodyInnAllowedForApiKey, filterRowsByApiKeyInns } from "./userApiKeyInnFilter.js";
import type { UserApiKeyScope } from "./userApiKeyScopes.js";
import { getPool } from "../api/_db.js";

export function readPartnerJsonBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export function parsePartnerDateRange(body: Record<string, unknown>): { dateFrom: string; dateTo: string } | null {
  const dateFrom = String(body.dateFrom ?? "2024-01-01");
  const dateTo = String(body.dateTo ?? new Date().toISOString().split("T")[0]);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(dateFrom) || !dateRe.test(dateTo)) return null;
  return { dateFrom, dateTo };
}

type PartnerAuthOk = Extract<PartnerOrUserAuthResult, { ok: true }>;

type PartnerV1PostRouteOpts<TRow> = {
  logTag: string;
  scope: UserApiKeyScope;
  requireDateRange?: boolean;
  readRows: (args: {
    pool: ReturnType<typeof getPool>;
    auth: PartnerAuthOk;
    body: Record<string, unknown>;
    dateFrom?: string;
    dateTo?: string;
  }) => Promise<TRow[]>;
  pickInn: (row: TRow) => string;
  formatResponse?: (rows: TRow[]) => unknown;
};

export function createPartnerV1PostRoute<TRow>(opts: PartnerV1PostRouteOpts<TRow>) {
  async function handler(req: VercelRequest, res: VercelResponse) {
    const ctx = initRequestContext(req, res, opts.logTag);
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
    }

    const auth = await resolvePartnerOrUserApiAuth(req, res, ctx.requestId, opts.scope);
    if (!auth.ok) return;

    const body = readPartnerJsonBody(req);
    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    if (opts.requireDateRange !== false) {
      const range = parsePartnerDateRange(body);
      if (!range) {
        return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD required)", request_id: ctx.requestId });
      }
      dateFrom = range.dateFrom;
      dateTo = range.dateTo;
    }

    const innErr = assertBodyInnAllowedForApiKey(body.inn, auth.keyAllowedInnsCanon);
    if (innErr) {
      return res.status(403).json({ error: innErr, request_id: ctx.requestId });
    }

    const pool = getPool();
    const rows = await opts.readRows({ pool, auth, body, dateFrom, dateTo });
    const filtered = filterRowsByApiKeyInns(rows, auth.keyAllowedInnsCanon, opts.pickInn);
    const payload = opts.formatResponse ? opts.formatResponse(filtered) : filtered;
    return res.status(200).json(payload);
  }

  return withErrorLog(handler);
}
