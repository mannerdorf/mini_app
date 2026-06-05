import type { Pool } from "pg";
import { getHaulzCalcDraft } from "./calculatorDraft.js";

/** КП на почту — только после оформления заявки (номер из 1С / pending_order). */
export async function resolveQuoteEmailNomerZayavki(
  pool: Pool,
  loginKey: string,
  input: { draftId?: number; nomerZayavki?: string | null },
): Promise<string | null> {
  const direct = String(input.nomerZayavki ?? "").trim();
  if (direct) return direct;

  const draftId = input.draftId;
  if (!draftId || !Number.isFinite(draftId) || draftId <= 0) return null;

  const draft = await getHaulzCalcDraft(pool, loginKey, draftId);
  const fromDraft = draft?.nomerZayavki?.trim();
  return fromDraft || null;
}

export const HAULZ_QUOTE_EMAIL_REQUIRES_ORDER_MSG =
  "Сначала оформите заявку (кнопка «Оформить»), затем отправьте КП на почту.";
