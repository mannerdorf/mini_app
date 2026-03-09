import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendWebPushToLogin } from "./_lib/webpushDelivery.js";
import { initRequestContext } from "./_lib/observability.js";

/** POST: отправить Web Push одному или нескольким пользователям. Body: { logins: string[], title, body?, url? } */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "webpush-send");
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

  const logins = Array.isArray(body?.logins) ? body.logins : body?.login ? [body.login] : [];
  const title = String(body?.title || "HAULZ");
  const bodyText = String(body?.body || "");
  const url = String(body?.url || "/").trim() || "/";

  if (logins.length === 0) {
    return res.status(400).json({ error: "logins or login is required", request_id: ctx.requestId });
  }

  const results: { login: string; sent: number; failed: number }[] = [];

  for (const login of logins) {
    const sendResult = await sendWebPushToLogin(String(login), {
      title,
      body: bodyText,
      url,
    });
    const sent = Number(sendResult.sent || 0);
    const failed = Number(sendResult.failed || 0);
    results.push({ login: String(login), sent, failed });
  }

  return res.status(200).json({ ok: true, results, request_id: ctx.requestId });
}
