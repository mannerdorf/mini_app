import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { loadCompanyPayeeDetails } from "../lib/companyPayeeDetails.js";
import { buildInvoicePaymentQr, qrPayloadToDataUrl } from "../lib/invoicePaymentQr.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { initRequestContext, logError } from "./_lib/observability.js";

/**
 * POST /api/invoice-payment-qr
 * Body: { login, password, invoice: { Number, DateDoc, Sum, Sum_paid?, StateBill?, ... } }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "invoice-payment-qr");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  let body: { login?: string; password?: string; invoice?: Record<string, unknown> } = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Неверный JSON", request_id: ctx.requestId });
    }
  }

  const login = body?.login;
  const password = body?.password;
  const invoice = body?.invoice && typeof body.invoice === "object" ? body.invoice : null;

  if (!login || !password) {
    return res.status(400).json({ error: "Укажите login и password", request_id: ctx.requestId });
  }
  if (!invoice) {
    return res.status(400).json({ error: "Укажите invoice", request_id: ctx.requestId });
  }

  try {
    const pool = getPool();
    const verified = await verifyRegisteredUser(pool, String(login), String(password));
    if (!verified) {
      return res.status(401).json({ error: "Неверный email или пароль", request_id: ctx.requestId });
    }

    const payee = await loadCompanyPayeeDetails(pool);
    if (!payee) {
      return res.status(503).json({
        error: "Реквизиты для оплаты не настроены на сервере",
        configured: false,
        request_id: ctx.requestId,
      });
    }

    const qr = await buildInvoicePaymentQr(payee, invoice);
    if (!qr) {
      return res.status(400).json({
        error: "По этому счёту нет суммы к оплате",
        configured: true,
        request_id: ctx.requestId,
      });
    }

    const qrImageDataUrl = qr.qrImageUrl.startsWith("data:")
      ? qr.qrImageUrl
      : await qrPayloadToDataUrl(qr.payload);

    return res.status(200).json({
      configured: true,
      ...qr,
      qrImageUrl: qrImageDataUrl,
      qrImageDataUrl,
      payeeName: payee.name,
      request_id: ctx.requestId,
    });
  } catch (e) {
    logError(ctx, "invoice_payment_qr_failed", e);
    return res.status(500).json({ error: "Ошибка формирования QR", request_id: ctx.requestId });
  }
}
