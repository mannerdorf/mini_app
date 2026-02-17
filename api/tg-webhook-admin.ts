import type { VercelRequest, VercelResponse } from "@vercel/node";

const TG_BOT_TOKEN = process.env.HAULZ_TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
const ADMIN_SECRET = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;

function resolveBaseUrl(req: VercelRequest): string {
  const envBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envBase && /^https?:\/\//i.test(envBase)) {
    return envBase.replace(/\/+$/, "");
  }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https").trim();
  if (host) return `${proto}://${host}`;
  return "https://mini-app-lake-phi.vercel.app";
}

async function telegramApi<T = any>(method: string, payload?: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  if (!TG_BOT_TOKEN) return { ok: false, status: 500, data: null, raw: "TG_BOT_TOKEN not set" };
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const raw = await res.text();
  let data: T | null = null;
  try {
    data = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, raw };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const secret = String(req.query.secret || (req.body && req.body.secret) || bearer || "");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!TG_BOT_TOKEN) {
    return res.status(503).json({ error: "HAULZ_TELEGRAM_BOT_TOKEN is not configured" });
  }

  const action = String(req.query.action || (req.body && req.body.action) || "info").toLowerCase();
  const baseUrl = resolveBaseUrl(req);
  const webhookUrl = `${baseUrl}/api/tg-webhook`;

  try {
    if (action === "set") {
      const result = await telegramApi("setWebhook", { url: webhookUrl });
      const info = await telegramApi("getWebhookInfo");
      return res.status(result.ok ? 200 : 502).json({
        ok: result.ok,
        action: "set",
        webhook_url: webhookUrl,
        telegram: result.data ?? result.raw,
        info: info.data ?? info.raw,
      });
    }

    if (action === "delete") {
      const result = await telegramApi("deleteWebhook");
      const info = await telegramApi("getWebhookInfo");
      return res.status(result.ok ? 200 : 502).json({
        ok: result.ok,
        action: "delete",
        telegram: result.data ?? result.raw,
        info: info.data ?? info.raw,
      });
    }

    const info = await telegramApi("getWebhookInfo");
    return res.status(info.ok ? 200 : 502).json({
      ok: info.ok,
      action: "info",
      expected_webhook_url: webhookUrl,
      info: info.data ?? info.raw,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Webhook admin error" });
  }
}

