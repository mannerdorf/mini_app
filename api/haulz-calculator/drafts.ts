import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";
import { pickHaulzCredentials } from "../_haulzReturns.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import {
  deleteHaulzCalcDraft,
  getHaulzCalcDraft,
  listHaulzCalcDrafts,
  listHaulzCalcSavedDrafts,
  upsertHaulzCalcDraft,
  type HaulzCalculatorFormState,
} from "../../lib/haulzCalculator/calculatorDraft.js";
import { parseHaulzCalcDraftStatus } from "../../lib/haulzCalculator/draftStatus.js";
import type { QuoteResult } from "../../lib/haulzCalculator/types.js";

function parseBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function parseFormState(raw: unknown): HaulzCalculatorFormState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.from && !o.to && !o.fromQuery && !o.toQuery) return null;
  return raw as HaulzCalculatorFormState;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_calculator_drafts");
  if (isRateLimited("haulz_calc_drafts", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorAccess(req, req.body);
  if (!access) {
    const creds = pickHaulzCredentials(req, req.body);
    if (!creds.login || !creds.password) {
      return res.status(401).json({ error: "Нет доступа: укажите login и password", request_id: ctx.requestId });
    }
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_drafts"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/085_haulz_calc_drafts.sql",
      request_id: ctx.requestId,
    });
  }

  const body = parseBody(req);
  const idRaw = Number(req.query.id ?? body.id);
  const id = Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null;

  try {
    if (req.method === "GET") {
      if (id) {
        const draft = await getHaulzCalcDraft(pool, access.loginKey, id);
        if (!draft) {
          return res.status(404).json({ error: "Черновик не найден", request_id: ctx.requestId });
        }
        return res.status(200).json({ draft, request_id: ctx.requestId });
      }
      const scope = String(req.query.scope ?? "").trim();
      const drafts =
        scope === "saved"
          ? await listHaulzCalcSavedDrafts(pool, access.loginKey)
          : await listHaulzCalcDrafts(pool, access.loginKey);
      return res.status(200).json({ drafts, request_id: ctx.requestId });
    }

    if (req.method === "POST") {
      const formState = parseFormState(body.formState ?? body.form_state);
      if (!formState) {
        return res.status(400).json({ error: "formState обязателен", request_id: ctx.requestId });
      }
      const quote = (body.quote ?? body.quoteResult ?? body.quote_result) as QuoteResult | undefined;
      const draft = await upsertHaulzCalcDraft(pool, access.loginKey, {
        id: id ?? undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        status: body.status != null ? parseHaulzCalcDraftStatus(body.status) : "draft",
        nomerZayavki:
          typeof body.nomerZayavki === "string"
            ? body.nomerZayavki
            : typeof body.nomer_zayavki === "string"
              ? body.nomer_zayavki
              : undefined,
        formState,
        quoteResult: quote ?? null,
      });
      return res.status(200).json({ draft, request_id: ctx.requestId });
    }

    if (req.method === "DELETE") {
      if (!id) {
        return res.status(400).json({ error: "Укажите id", request_id: ctx.requestId });
      }
      const ok = await deleteHaulzCalcDraft(pool, access.loginKey, id);
      if (!ok) {
        return res.status(404).json({ error: "Черновик не найден", request_id: ctx.requestId });
      }
      return res.status(200).json({ ok: true, request_id: ctx.requestId });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  } catch (e) {
    logError(ctx, "haulz_calculator_drafts_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка черновиков",
      request_id: ctx.requestId,
    });
  }
}
