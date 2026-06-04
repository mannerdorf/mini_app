import { notifyPartnerWebhooks } from "../partnerWebhook.js";

export type CalcTransportAgreeWebhookPayload = {
  draftId: number;
  loginKey: string;
  status: string;
  recipientEmail?: string | null;
  title?: string | null;
  totalRub?: number | null;
  nomerZayavki?: string | null;
};

/** Уведомление партнёра и опциональный отдельный URL при согласии перевозки из КП. */
export async function notifyCalcTransportAgree(payload: CalcTransportAgreeWebhookPayload): Promise<void> {
  await notifyPartnerWebhooks({
    event: "haulz_calc.transport_agree",
    payload: payload as unknown as Record<string, unknown>,
  });

  const directUrl = String(process.env.HAULZ_CALC_AGREE_WEBHOOK_URL || "").trim();
  if (!directUrl) return;

  try {
    await fetch(directUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Haulz-Calc-Agree-Webhook/1" },
      body: JSON.stringify({
        event: "haulz_calc.transport_agree",
        sent_at: new Date().toISOString(),
        ...payload,
      }),
    });
  } catch {
    /* fire-and-forget */
  }
}
