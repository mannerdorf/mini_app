import type { VercelRequest, VercelResponse } from "@vercel/node";
import { haulzCalculatorPreflight } from "./_preflight.js";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import {
  HAULZ_CALC_GUEST_LOGIN_KEY,
  resolveHaulzCalculatorGuestQuoteAccess,
} from "../_haulzCalculator.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import { buildQuote } from "../../lib/haulzCalculator/quoteEngine.js";
import { saveQuoteSnapshot } from "../../lib/haulzCalculator/quoteSnapshot.js";
import {
  upsertHaulzCalcDraft,
  type HaulzCalculatorFormState,
} from "../../lib/haulzCalculator/calculatorDraft.js";
import { saveDraftForQuoteEmail } from "../../lib/haulzCalculator/calculatorDraftAgree.js";
import {
  quoteProposalEmailSubject,
  renderHaulzQuoteProposalHtml,
} from "../../lib/haulzCalculator/quoteProposalEmail.js";
import { sendHaulzEmail } from "../../lib/sendRegistrationEmail.js";
import type {
  AddressSelection,
  DeliveryParty,
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

function parseFormState(raw: unknown): HaulzCalculatorFormState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.from && !o.to && !o.fromQuery && !o.toQuery) return null;
  return raw as HaulzCalculatorFormState;
}

function defaultPickupDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeGuestPhone(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7")) digits = `7${digits}`;
  digits = digits.slice(0, 11);
  return digits.length === 11 ? digits : null;
}

function formatGuestPhoneDisplay(digits: string): string {
  const p1 = digits.slice(1, 4);
  const p2 = digits.slice(4, 7);
  const p3 = digits.slice(7, 9);
  const p4 = digits.slice(9, 11);
  return `+7 (${p1}) ${p2}-${p3}-${p4}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (haulzCalculatorPreflight(req, res)) return;
  const ctx = initRequestContext(req, res, "haulz_calculator_guest_order");
  if (isRateLimited("haulz_calc_guest_order", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов", request_id: ctx.requestId });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzCalculatorGuestQuoteAccess(req, req.body);
  if (!access || access.loginKey !== HAULZ_CALC_GUEST_LOGIN_KEY) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_calc_tariff_sets"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/083_haulz_calculator.sql",
      request_id: ctx.requestId,
    });
  }
  if (!(await pgTableExists(pool, "haulz_calc_drafts"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/085_haulz_calc_drafts.sql",
      request_id: ctx.requestId,
    });
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const contactPhoneDigits = normalizeGuestPhone(body.contactPhone ?? body.contact_phone ?? body.phone);
  const contactEmail = String(body.contactEmail ?? body.contact_email ?? body.email ?? "")
    .trim()
    .toLowerCase();

  if (!contactPhoneDigits) {
    return res.status(400).json({ error: "Укажите номер телефона", request_id: ctx.requestId });
  }
  if (!contactEmail || !isValidEmail(contactEmail)) {
    return res.status(400).json({ error: "Укажите корректный email", request_id: ctx.requestId });
  }

  const from = parseAddress(body.from);
  const to = parseAddress(body.to);
  if (!from || !to) {
    return res.status(400).json({ error: "from и to с координатами обязательны", request_id: ctx.requestId });
  }

  const formStateRaw = parseFormState(body.formState ?? body.form_state);
  if (!formStateRaw) {
    return res.status(400).json({ error: "formState обязателен", request_id: ctx.requestId });
  }

  const contactPhoneDisplay = formatGuestPhoneDisplay(contactPhoneDigits);
  const formState: HaulzCalculatorFormState = {
    ...formStateRaw,
    guestContactPhone: contactPhoneDisplay,
    guestContactEmail: contactEmail,
  };

  const dataZabora = String(body.dataZabora ?? body.data_zabora ?? formState.dataZabora ?? defaultPickupDate()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataZabora)) {
    return res.status(400).json({ error: "dataZabora: формат YYYY-MM-DD", request_id: ctx.requestId });
  }

  const mainlineMode = parseMainlineMode(
    body.mainlineMode ?? body.mainline_mode ?? formState.mainlineMode,
  );

  const quoteReq: QuoteRequest = {
    from,
    to,
    places: parsePlaces(body.places ?? formState.places),
    mainlineMode,
    direction:
      body.direction === "mow_kgd" || body.direction === "kgd_mow"
        ? body.direction
        : formState.directionOverride ?? undefined,
    declaredValueRub: Number(body.declaredValueRub ?? body.declared_value_rub ?? formState.declaredValue) || 0,
    extraCodes: Array.isArray(body.extraCodes)
      ? body.extraCodes.map(String)
      : Array.isArray(body.extra_codes)
        ? body.extra_codes.map(String)
        : formState.extraCodes ?? [],
    fromParty: parseParty(body.fromParty ?? body.from_party),
    toParty: parseParty(body.toParty ?? body.to_party),
    customerParty: parseParty(body.customerParty ?? body.customer_party),
  };

  try {
    const quote = await buildQuote(pool, quoteReq);
    let quoteId: number | undefined;
    if (await pgTableExists(pool, "haulz_calc_quotes")) {
      quoteId = await saveQuoteSnapshot(pool, access.loginKey, quoteReq, quote);
      quote.quoteId = quoteId;
    }

    const nomerZayavki = `HAULZ-G-${quoteId ?? Date.now()}`;

    const tableRows = [
      {
        type: "guest_contact",
        phone: contactPhoneDisplay,
        email: contactEmail,
      },
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
        customer: quoteReq.customerParty,
        from: quoteReq.fromParty,
        to: quoteReq.toParty,
        hubs: quote.hubs,
      },
    ];

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
      [contactEmail, null, from.fullAddress, to.fullAddress, nomerZayavki, dataZabora, JSON.stringify(tableRows)],
    );

    const draft = await upsertHaulzCalcDraft(pool, HAULZ_CALC_GUEST_LOGIN_KEY, {
      formState,
      quoteResult: quote,
      status: "new",
      nomerZayavki,
    });

    const { agreeUrl } = await saveDraftForQuoteEmail(pool, HAULZ_CALC_GUEST_LOGIN_KEY, {
      draftId: draft.id,
      formState,
      quote,
      recipientEmail: contactEmail,
    });

    const html = renderHaulzQuoteProposalHtml({
      quote,
      from,
      to,
      places: quoteReq.places,
      mainlineMode,
      direction: quote.direction,
      dataZabora,
      fromParty: quoteReq.fromParty,
      toParty: quoteReq.toParty,
      agreeUrl: agreeUrl || undefined,
    });

    const subject = quoteProposalEmailSubject(quote.direction);
    const sendResult = await sendHaulzEmail(pool, { to: contactEmail, subject, html });
    if (!sendResult.ok) {
      return res.status(502).json({
        error: sendResult.error || "Заявка создана, но не удалось отправить КП на почту",
        nomerZayavki,
        quote,
        draftId: draft.id,
        request_id: ctx.requestId,
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Заявка оформлена. Менеджер с вами свяжется.",
      nomerZayavki,
      quote,
      quoteId,
      draftId: draft.id,
      emailSent: true,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "haulz_calculator_guest_order_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка оформления",
      request_id: ctx.requestId,
    });
  }
}
