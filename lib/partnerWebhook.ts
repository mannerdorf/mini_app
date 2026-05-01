import crypto from "crypto";

export type PartnerWebhookEventPayload = {
  event: string;
  payload: Record<string, unknown>;
};

/**
 * Исходящие webhooks для экосистемы партнёра.
 * Задайте `HAULZ_PARTNER_WEBHOOK_URL` (один URL) или `HAULZ_PARTNER_WEBHOOK_URLS` (через запятую).
 * Подпись: HMAC-SHA256(secret, `${timestamp}.${body}`) в заголовке `X-Haulz-Signature`, время в `X-Haulz-Timestamp`.
 */
export function getPartnerWebhookUrls(): string[] {
  const multi = String(process.env.HAULZ_PARTNER_WEBHOOK_URLS || "").trim();
  if (multi) {
    return multi
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  const single = String(process.env.HAULZ_PARTNER_WEBHOOK_URL || "").trim();
  return single ? [single] : [];
}

export function getPartnerWebhookSecret(): string {
  return String(process.env.HAULZ_PARTNER_WEBHOOK_SECRET || "").trim();
}

export function signPartnerWebhookBody(secret: string, timestampSec: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestampSec}.${body}`).digest("hex");
}

/** Fire-and-forget: не бросает наружу при сетевых ошибках. */
export async function notifyPartnerWebhooks(message: PartnerWebhookEventPayload): Promise<void> {
  const urls = getPartnerWebhookUrls();
  const secret = getPartnerWebhookSecret();
  if (urls.length === 0 || !secret) return;

  const envelope = {
    ...message,
    sent_at: new Date().toISOString(),
  };
  const body = JSON.stringify(envelope);
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = signPartnerWebhookBody(secret, ts, body);

  await Promise.allSettled(
    urls.map((url) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Haulz-Event": message.event,
          "X-Haulz-Timestamp": ts,
          "X-Haulz-Signature": signature,
          "User-Agent": "Haulz-Partner-Webhook/1",
        },
        body,
      })
    )
  );
}
