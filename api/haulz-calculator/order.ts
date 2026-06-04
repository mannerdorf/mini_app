import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { resolveHaulzCalculatorAccess } from "../_haulzCalculator.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import { buildQuote } from "../../lib/haulzCalculator/quoteEngine.js";
import { saveQuoteSnapshot } from "../../lib/haulzCalculator/quoteSnapshot.js";
import type {
  AddressSelection,
  DeliveryParty,
  MainlineMode,
  ParcelPlace,
  QuoteRequest,
} from "../../lib/haulzCalculator/types.js";
import { verifyRegisteredUser } from "../../lib/verifyRegisteredUser.js";

const normalizeLogin = (v: unknown) => String(v ?? "").trim().toLowerCase();
const normalizeInn = (v: unknown) => String(v ?? "").replace(/\D/g, "").trim();

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
  };
}

function defaultPickupDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_calculator_order");
  if (isRateLimited("haulz_calc_order", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
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
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const from = parseAddress(body.from);
  const to = parseAddress(body.to);
  if (!from || !to) {
    return res.status(400).json({ error: "from и to с координатами обязательны", request_id: ctx.requestId });
  }

  const dataZabora = String(body.dataZabora ?? body.data_zabora ?? defaultPickupDate()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataZabora)) {
    return res.status(400).json({ error: "dataZabora: формат YYYY-MM-DD", request_id: ctx.requestId });
  }

  const modeRaw = String(body.mainlineMode ?? body.mainline_mode ?? "ferry").toLowerCase();
  const mainlineMode: MainlineMode = modeRaw === "auto" ? "auto" : "ferry";

  const quoteReq: QuoteRequest = {
    from,
    to,
    places: parsePlaces(body.places),
    mainlineMode,
    direction:
      body.direction === "mow_kgd" || body.direction === "kgd_mow" ? body.direction : undefined,
    declaredValueRub: Number(body.declaredValueRub ?? body.declared_value_rub) || 0,
    extraCodes: Array.isArray(body.extraCodes)
      ? body.extraCodes.map(String)
      : Array.isArray(body.extra_codes)
        ? body.extra_codes.map(String)
        : [],
    kmOverride:
      body.kmOverride && typeof body.kmOverride === "object"
        ? {
            moscow: Number((body.kmOverride as Record<string, unknown>).moscow),
            kaliningrad: Number((body.kmOverride as Record<string, unknown>).kaliningrad),
          }
        : undefined,
    fromParty: parseParty(body.fromParty ?? body.from_party),
    toParty: parseParty(body.toParty ?? body.to_party),
  };

  try {
    const quote = await buildQuote(pool, quoteReq);
    let quoteId: number | undefined;
    if (await pgTableExists(pool, "haulz_calc_quotes")) {
      quoteId = await saveQuoteSnapshot(pool, access.loginKey, quoteReq, quote);
      quote.quoteId = quoteId;
    }

    const nomerZayavki =
      String(body.nomerZayavki ?? body.nomer_zayavki ?? "").trim() ||
      `HAULZ-CALC-${quoteId ?? Date.now()}`;

    const tableRows = [
      {
        type: "cargo",
        places: quoteReq.places,
        chargeableWeightKg: quote.chargeable.chargeableWeightKg,
        declaredValueRub: quoteReq.declaredValueRub,
      },
      {
        type: "quote_lines",
        lines: quote.lines,
        totalRub: quote.totalRub,
        deliveryDays: quote.deliveryDays,
        direction: quote.direction,
        mainlineMode,
      },
      {
        type: "contacts",
        from: quoteReq.fromParty,
        to: quoteReq.toParty,
        hubs: quote.hubs,
      },
    ];

    const login = normalizeLogin(access.login);
    const { rows: userRows } = await pool.query<{ inn: string | null }>(
      `select inn from registered_users where lower(trim(login)) = $1 and active = true`,
      [access.loginKey],
    );
    const inn = userRows[0]?.inn ? normalizeInn(userRows[0].inn) : null;

    await pool.query(
      `CREATE TABLE IF NOT EXISTS pending_order_requests (
        id SERIAL PRIMARY KEY,
        login TEXT NOT NULL,
        inn TEXT,
        punkt_otpravki TEXT NOT NULL,
        punkt_naznacheniya TEXT NOT NULL,
        nomer_zayavki TEXT NOT NULL,
        data_zabora DATE NOT NULL,
        table_rows JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    );

    await pool.query(
      `INSERT INTO pending_order_requests (login, inn, punkt_otpravki, punkt_naznacheniya, nomer_zayavki, data_zabora, table_rows)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::jsonb)`,
      [login, inn, from.fullAddress, to.fullAddress, nomerZayavki, dataZabora, JSON.stringify(tableRows)],
    );

    return res.status(200).json({
      ok: true,
      message: "Заявка зарегистрирована для передачи в 1С",
      nomerZayavki,
      quote,
      quoteId,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "haulz_calculator_order_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка оформления",
      request_id: ctx.requestId,
    });
  }
}
