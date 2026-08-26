import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import { pgTableExists } from "../_haulzReturns.js";
import { getClientIp, isRateLimited, HAULZ_CALC_QUOTE_LIMIT } from "../../lib/rateLimit.js";
import { upsertHaulzCalcDraft } from "../../lib/haulzCalculator/calculatorDraft.js";
import {
  buildDocumentsOrderFormState,
  documentsOrderManagerDraftTitle,
} from "../../lib/haulzCalculator/documentsOrderManagerDraft.js";
import {
  legRequiresPvzCreation,
  type OrderLegAddressKind,
} from "../../lib/haulzCalculator/orderAddressKind.js";
import { buildQuote } from "../../lib/haulzCalculator/quoteEngine.js";
import {
  quoteProposalEmailSubject,
  renderHaulzQuoteProposalHtml,
} from "../../lib/haulzCalculator/quoteProposalEmail.js";
import { sendHaulzEmail } from "../../lib/sendRegistrationEmail.js";
import { HAULZ_LEGAL } from "../../lib/haulzLegal.js";
import {
  buildQuoteRequestFromBody,
  defaultPickupDate,
  normalizeLogin,
  parseJsonBody,
  resolveDocumentsOrderAccess,
} from "../_documentsOrder.js";
import { buildDocumentsOrderZayavkaPayload, mapLegacyTableRowInput } from "../../lib/documentsOrderZayavkaPayload.js";
import {
  fivepostBatchIdFromTableRows,
  loadFivepostRowsByBatchIds,
} from "../../lib/pendingOrderRequests.js";
import { PENDING_ORDER_ZAYAVKA_ROW_TYPE } from "../../lib/documentsOrderPending1c.js";
import { normalizeZayavkaUploadPayload } from "../../lib/post1cZayavkaUpload.js";
import { finalizeZayavkaPayloadFor1c } from "../../lib/finalizeZayavkaPayloadFor1c.js";

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

type AttachmentInput = {
  name?: string;
  mimeType?: string;
  base64?: string;
};

function parseAttachments(raw: unknown): AttachmentInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object")
    .map((a) => {
      const o = a as Record<string, unknown>;
      return {
        name: String(o.name ?? "").trim() || undefined,
        mimeType: String(o.mimeType ?? o.mime_type ?? "").trim() || undefined,
        base64: String(o.base64 ?? "").trim() || undefined,
      };
    })
    .filter((a) => a.name && a.base64);
}

function attachmentSizeBytes(base64: string): number {
  const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - pad;
}

function parseOrderLegAddressKind(raw: string): OrderLegAddressKind {
  if (raw === "custom" || raw === "warehouse" || raw === "pvz") return raw;
  return "pvz";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "documents_order_submit");
  if (isRateLimited("documents_order_submit", getClientIp(req), HAULZ_CALC_QUOTE_LIMIT)) {
    return res.status(429).json({ error: "Слишком много запросов", request_id: ctx.requestId });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const body = parseJsonBody(req);
  const access = await resolveDocumentsOrderAccess(req, body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const punktOtpravki = String(body.punktOtpravki ?? body.punkt_otpravki ?? "").trim();
  const punktNaznacheniya = String(body.punktNaznacheniya ?? body.punkt_naznacheniya ?? "").trim();
  if (!punktOtpravki || !punktNaznacheniya) {
    return res.status(400).json({ error: "Укажите пункт отправки и назначения", request_id: ctx.requestId });
  }

  const dataZabora = String(body.dataZabora ?? body.data_zabora ?? defaultPickupDate()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataZabora)) {
    return res.status(400).json({ error: "dataZabora: формат YYYY-MM-DD", request_id: ctx.requestId });
  }

  const parsed = buildQuoteRequestFromBody(body, access.customerInn);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error, request_id: ctx.requestId });
  }

  const { quoteReq, from, to } = parsed;
  const mainlineMode = quoteReq.mainlineMode;

  const legacyTableRows = Array.isArray(body.tableRows) ? body.tableRows : [];
  const fivepostBatchId = Number(body.fivepostBatchId ?? body.fivepost_batch_id);
  const attachments = parseAttachments(body.attachments);
  let attachmentsTooLarge = false;
  for (const att of attachments) {
    if (att.base64 && attachmentSizeBytes(att.base64) > MAX_ATTACHMENT_BYTES) {
      attachmentsTooLarge = true;
      break;
    }
  }

  const nomerZayavkiKlienta = String(
    body.nomerZayavkiKlienta ??
      body.nomer_zayavki_klienta ??
      body.clientRequestNumber ??
      body.client_request_number ??
      "",
  ).trim();

  const nomerZayavki = `HAULZ-DOC-${Date.now()}`;

  const fromPvzRef = String(body.fromPvzRef ?? body.from_pvz_ref ?? "").trim() || undefined;
  const toPvzRef = String(body.toPvzRef ?? body.to_pvz_ref ?? "").trim() || undefined;
  const fromAddressType = parseOrderLegAddressKind(
    String(body.fromAddressType ?? body.from_address_type ?? "pvz").trim(),
  );
  const toAddressType = parseOrderLegAddressKind(
    String(body.toAddressType ?? body.to_address_type ?? "pvz").trim(),
  );
  const fromPartyMode = quoteReq.fromParty?.mode === "point" ? "point" : "courier";
  const toPartyMode = quoteReq.toParty?.mode === "point" ? "point" : "courier";
  const fromRequiresPvzCreation = legRequiresPvzCreation(fromPartyMode, fromAddressType);
  const toRequiresPvzCreation = legRequiresPvzCreation(toPartyMode, toAddressType);

  const pool = getPool();

  try {
    const quote = await buildQuote(pool, quoteReq);

    let fivepostBatchBlock: { type: "fivepost"; batchId: number } | null = null;
    if (Number.isFinite(fivepostBatchId) && fivepostBatchId > 0) {
      if (await pgTableExists(pool, "fivepost_import_batches")) {
        const { rows: ownerRows } = await pool.query<{ login: string }>(
          `SELECT login FROM fivepost_import_batches WHERE id = $1 LIMIT 1`,
          [fivepostBatchId],
        );
        const owner = normalizeLogin(ownerRows[0]?.login);
        if (owner && owner === normalizeLogin(access.login)) {
          fivepostBatchBlock = { type: "fivepost", batchId: fivepostBatchId };
        }
      }
    }

    let zayavkaPayload: ReturnType<typeof buildDocumentsOrderZayavkaPayload> | null = null;
    const clientNorm = normalizeZayavkaUploadPayload(body.zayavkaPayload ?? body.zayavka_payload ?? body.order);
    if (clientNorm.ok) {
      zayavkaPayload = clientNorm.payload;
    } else {
      let fivepostRows: Parameters<typeof buildDocumentsOrderZayavkaPayload>[0]["fivepostRows"];
      if (fivepostBatchBlock) {
        const byBatch = await loadFivepostRowsByBatchIds(pool, [fivepostBatchBlock.batchId]);
        fivepostRows = (byBatch.get(fivepostBatchBlock.batchId) ?? []).map((r) => ({
          omniBarcode: String(r.omniBarcode ?? ""),
          teBarcode: String(r.teBarcode ?? ""),
          clientOrderNo: String(r.clientOrderNo ?? ""),
          partnerOrderNo: String(r.partnerOrderNo ?? ""),
          itemNameRu: String(r.itemNameRu ?? ""),
          itemName: String(r.itemName ?? ""),
          unitCost: typeof r.unitCost === "number" ? r.unitCost : Number(r.unitCost) || 0,
          totalCost: typeof r.totalCost === "number" ? r.totalCost : Number(r.totalCost) || 0,
          placesCount: typeof r.placesCount === "number" ? r.placesCount : Number(r.placesCount) || 1,
        }));
      }
      zayavkaPayload = buildDocumentsOrderZayavkaPayload({
        customerInn: access.customerInn,
        senderInn: quoteReq.fromParty?.inn,
        receiverInn: quoteReq.toParty?.inn,
        punktOtpravki,
        punktNaznacheniya,
        dataZabora,
        nomerZayavkiKlienta: nomerZayavkiKlienta || undefined,
        declaredValueRub: quoteReq.declaredValueRub ?? 0,
        placeCount: quoteReq.places.length,
        fivepostRows,
        tableRows: legacyTableRows.map((r) => mapLegacyTableRowInput(r)),
      });
    }

    const tableRowsCore = [
      {
        type: "source",
        channel: "documents_orders",
        login: access.login,
        customerInn: access.customerInn,
        customerName: access.customerName,
        customerRequestNumber: nomerZayavkiKlienta || undefined,
      },
      {
        type: "pvz",
        from: { ref: fromPvzRef || punktOtpravki, addressType: fromAddressType, address: from },
        to: { ref: toPvzRef || punktNaznacheniya, addressType: toAddressType, address: to },
      },
      {
        type: "cargo",
        places: quoteReq.places,
        chargeableWeightKg: quote.chargeable.chargeableWeightKg,
        declaredValueRub: quoteReq.declaredValueRub ?? 0,
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
      ...(legacyTableRows.length
        ? [{ type: "legacy_parcels", rows: legacyTableRows }]
        : []),
      ...(fivepostBatchBlock ? [fivepostBatchBlock] : []),
      {
        type: "attachments",
        items: attachments.map((a) => ({
          name: a.name,
          mimeType: a.mimeType,
          includedInEmail: !attachmentsTooLarge,
        })),
        tooLarge: attachmentsTooLarge,
      },
    ];

    if (zayavkaPayload) {
      zayavkaPayload = await finalizeZayavkaPayloadFor1c(pool, zayavkaPayload, {
        nomerZayavki: nomerZayavki || undefined,
        tableRows: tableRowsCore,
      });
    }

    const tableRows = [
      ...tableRowsCore,
      { type: PENDING_ORDER_ZAYAVKA_ROW_TYPE, payload: zayavkaPayload },
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

    const login = normalizeLogin(access.login);
    const inn = access.customerInn || null;

    await pool.query(
      `INSERT INTO pending_order_requests (login, inn, punkt_otpravki, punkt_naznacheniya, nomer_zayavki, data_zabora, table_rows)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::jsonb)`,
      [login, inn, punktOtpravki, punktNaznacheniya, nomerZayavki, dataZabora, JSON.stringify(tableRows)],
    );

    if (await pgTableExists(pool, "haulz_calc_drafts")) {
      try {
        const formState = buildDocumentsOrderFormState({
          from,
          to,
          fromParty: quoteReq.fromParty,
          toParty: quoteReq.toParty,
          fromAddressKind: fromAddressType,
          toAddressKind: toAddressType,
          customerInn: access.customerInn,
          customerName: access.customerName,
          places: quoteReq.places,
          mainlineMode,
          direction: quote.direction,
          declaredValueRub: quoteReq.declaredValueRub ?? 0,
          extraCodes: quoteReq.extraCodes ?? [],
          dataZabora,
        });
        await upsertHaulzCalcDraft(pool, access.loginKey, {
          title: documentsOrderManagerDraftTitle(from, to),
          status: "new",
          nomerZayavki,
          formState,
          quoteResult: quote,
        });
      } catch (draftErr) {
        logError(ctx, "documents_order_manager_draft_failed", draftErr);
      }
    }

    let html = renderHaulzQuoteProposalHtml({
      quote,
      from,
      to,
      places: quoteReq.places,
      mainlineMode,
      direction: quote.direction,
      dataZabora,
      fromParty: quoteReq.fromParty,
      toParty: quoteReq.toParty,
      fromRequiresPvzCreation,
      toRequiresPvzCreation,
    });

    const docsBanner = `
      <div style="margin:0 0 16px;padding:12px 14px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;font-size:13px;color:#1e40af;">
        Заявка из личного кабинета · раздел «Документы → Заявки»<br/>
        Заказчик: ${access.customerName || "—"} · ИНН ${access.customerInn}<br/>
        Номер заявки: ${nomerZayavki} · Логин: ${access.login}
        ${nomerZayavkiKlienta ? `<br/>Номер заявки заказчика: ${nomerZayavkiKlienta}` : ""}
      </div>`;
    html = docsBanner + html;

    if (attachmentsTooLarge) {
      html += `<p style="font-size:12px;color:#6b7280;margin-top:12px;">Вложения превышают лимит и сохранены только в заявке в БД.</p>`;
    } else if (attachments.length) {
      html += `<p style="font-size:12px;color:#6b7280;margin-top:12px;">Вложения: ${attachments.map((a) => a.name).join(", ")}</p>`;
    }

    const subject = `[ЛК] ${quoteProposalEmailSubject(quote.direction)} · ${nomerZayavki}`;
    const sendResult = await sendHaulzEmail(pool, {
      to: HAULZ_LEGAL.email,
      subject,
      html,
    });

    if (!sendResult.ok) {
      logError(ctx, "documents_order_submit_email_failed", new Error(sendResult.error || "email failed"));
    }

    return res.status(200).json({
      ok: true,
      message: sendResult.ok
        ? "Заявка зарегистрирована и отправлена на обработку"
        : "Заявка зарегистрирована; письмо не отправлено",
      nomerZayavki,
      quote,
      emailSent: sendResult.ok,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "documents_order_submit_failed", e);
    return res.status(500).json({
      error: (e as Error)?.message || "Ошибка оформления",
      request_id: ctx.requestId,
    });
  }
}
