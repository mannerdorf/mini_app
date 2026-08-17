import type { VercelRequest, VercelResponse } from "@vercel/node";
import { haulzCalculatorPreflight } from "./_preflight.js";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import { buildQuote } from "../../lib/haulzCalculator/quoteEngine.js";
import {
  quoteProposalEmailSubject,
  renderHaulzQuoteProposalHtml,
} from "../../lib/haulzCalculator/quoteProposalEmail.js";
import type {
  AddressSelection,
  DeliveryParty,
  Direction,
  ParcelPlace,
  QuoteRequest,
} from "../../lib/haulzCalculator/types.js";
import { parseMainlineMode } from "../../lib/haulzCalculator/mainlineMode.js";

function parseAddress(raw: unknown): AddressSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const point = o.point as { lat?: unknown; lon?: unknown } | undefined;
  const lat = Number(point?.lat);
  const lon = Number(point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const label = String(o.label ?? "").trim();
  const fullAddress = String(o.fullAddress ?? o.full_address ?? label).trim();
  if (!fullAddress) return null;
  const city = o.city === "moscow" || o.city === "kaliningrad" ? o.city : undefined;
  return {
    label: label || fullAddress,
    fullAddress,
    point: { lat, lon },
    city,
    sourceId: typeof o.sourceId === "string" ? o.sourceId : undefined,
  };
}

function parsePlaces(raw: unknown): ParcelPlace[] {
  if (!Array.isArray(raw) || raw.length === 0) return [{ weightKg: 1, volumeM3: 0.01 }];
  return raw.map((p) => {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    return {
      weightKg: Math.max(0, Number(o.weightKg ?? o.weight_kg) || 0),
      volumeM3: Math.max(0, Number(o.volumeM3 ?? o.volume_m3) || 0),
    };
  });
}

function parseParty(raw: unknown): DeliveryParty | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "point" ? "point" : o.mode === "courier" ? "courier" : undefined;
  if (!mode) return undefined;
  const innRaw = typeof o.inn === "string" ? o.inn.replace(/\D/g, "").trim() : "";
  return {
    mode,
    inn: innRaw || undefined,
    phone: typeof o.phone === "string" ? o.phone.trim() : undefined,
    fullName: typeof o.fullName === "string" ? o.fullName.trim() : undefined,
    companyName:
      typeof o.companyName === "string"
        ? o.companyName.trim()
        : typeof o.company_name === "string"
          ? o.company_name.trim()
          : undefined,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (haulzCalculatorPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "haulz_calculator_preview_quote_email");
  if (isRateLimited("haulz_calc_preview_email", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов", request_id: ctx.requestId });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_tariff_sets"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/083_haulz_calculator.sql",
      request_id: ctx.requestId,
    });
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const from = parseAddress(body.from);
  const toAddr = parseAddress(body.to);
  if (!from || !toAddr) {
    return res.status(400).json({
      error: "from и to с координатами обязательны",
      request_id: ctx.requestId,
    });
  }

  const mainlineMode = parseMainlineMode(body.mainlineMode ?? body.mainline_mode);
  const directionRaw = String(body.direction ?? "").toLowerCase();
  const direction: Direction =
    directionRaw === "kgd_mow" ? "kgd_mow" : directionRaw === "mow_kgd" ? "mow_kgd" : "mow_kgd";

  const quoteReq: QuoteRequest = {
    from,
    to: toAddr,
    places: parsePlaces(body.places),
    mainlineMode,
    direction,
    declaredValueRub: Math.max(0, Number(body.declaredValueRub ?? body.declared_value_rub) || 0),
    extraCodes: Array.isArray(body.extraCodes)
      ? (body.extraCodes as unknown[]).map((c) => String(c).trim()).filter(Boolean)
      : [],
    fromParty: parseParty(body.fromParty ?? body.from_party),
    toParty: parseParty(body.toParty ?? body.to_party),
    customerParty: parseParty(body.customerParty ?? body.customer_party),
  };

  try {
    const quote = await buildQuote(pool, quoteReq);
    const dataZabora =
      typeof body.dataZabora === "string"
        ? body.dataZabora.trim()
        : typeof body.data_zabora === "string"
          ? body.data_zabora.trim()
          : undefined;

    const html = renderHaulzQuoteProposalHtml({
      quote,
      from,
      to: toAddr,
      places: quoteReq.places,
      mainlineMode,
      direction: quote.direction,
      dataZabora,
      fromParty: quoteReq.fromParty,
      toParty: quoteReq.toParty,
    });

    return res.status(200).json({
      html,
      subject: quoteProposalEmailSubject(quote.direction),
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "haulz_calc_preview_email_failed", e);
    const msg = e instanceof Error ? e.message : "Ошибка предпросмотра";
    return res.status(500).json({ error: msg, request_id: ctx.requestId });
  }
}
