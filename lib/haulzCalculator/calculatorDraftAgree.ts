import crypto from "crypto";
import type { Pool } from "pg";
import { notifyCalcTransportAgree } from "./calcAgreeWebhook.js";
import type { HaulzCalculatorFormState, HaulzCalcDraftRow } from "./calculatorDraft.js";
import { getHaulzCalcDraft } from "./calculatorDraft.js";
import { parseHaulzCalcDraftStatus, type HaulzCalcDraftStatus } from "./draftStatus.js";
import { buildCalcAgreeTransportUrl } from "./publicApiBase.js";
import type { QuoteResult } from "./types.js";

function newAgreeToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

type DraftDbRow = {
  id: string;
  login_key: string;
  title: string | null;
  status: string;
  nomer_zayavki: string | null;
  form_state: HaulzCalculatorFormState;
  quote_result: QuoteResult | null;
  recipient_email: string | null;
  agree_token: string | null;
  transport_agreed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapRowExtended(r: DraftDbRow): HaulzCalcDraftRow {
  return {
    id: Number(r.id),
    title: r.title,
    status: parseHaulzCalcDraftStatus(r.status),
    nomerZayavki: r.nomer_zayavki,
    formState: r.form_state,
    quoteResult: r.quote_result,
    recipientEmail: r.recipient_email,
    agreeToken: r.agree_token,
    transportAgreedAt: r.transport_agreed_at ? new Date(r.transport_agreed_at).toISOString() : null,
    loginKey: r.login_key,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function saveDraftForQuoteEmail(
  pool: Pool,
  loginKey: string,
  input: {
    draftId?: number;
    formState: HaulzCalculatorFormState;
    quote: QuoteResult;
    recipientEmail: string;
  },
): Promise<{ draft: HaulzCalcDraftRow; agreeUrl: string }> {
  const token = newAgreeToken();
  const { rows } = await pool.query<{ id: string }>(
    input.draftId
      ? `update haulz_calc_drafts set
           title = coalesce(title, $3),
           status = 'new',
           form_state = $4::jsonb,
           quote_result = $5::jsonb,
           recipient_email = $6,
           agree_token = $7,
           updated_at = now()
         where login_key = $1 and id = $2
         returning id::text`
      : `insert into haulz_calc_drafts (
           login_key, title, status, form_state, quote_result, recipient_email, agree_token
         ) values ($1, $2, 'new', $3::jsonb, $4::jsonb, $5, $6)
         returning id::text`,
    input.draftId
      ? [
          loginKey,
          input.draftId,
          `${input.formState.from?.label || input.formState.fromQuery || "—"} → ${input.formState.to?.label || input.formState.toQuery || "—"}`,
          JSON.stringify(input.formState),
          JSON.stringify(input.quote),
          input.recipientEmail,
          token,
        ]
      : [
          loginKey,
          `${input.formState.from?.label || input.formState.fromQuery || "—"} → ${input.formState.to?.label || input.formState.toQuery || "—"}`,
          JSON.stringify(input.formState),
          JSON.stringify(input.quote),
          input.recipientEmail,
          token,
        ],
  );
  const id = Number(rows[0]?.id);
  const draft = await getHaulzCalcDraft(pool, loginKey, id);
  if (!draft?.agreeToken) throw new Error("Не удалось сохранить заявку для согласования");
  return { draft, agreeUrl: buildCalcAgreeTransportUrl(draft.agreeToken) };
}

export async function getDraftByAgreeToken(pool: Pool, token: string): Promise<HaulzCalcDraftRow | null> {
  const t = String(token || "").trim();
  if (!t) return null;
  const { rows } = await pool.query<DraftDbRow>(
    `select id::text, login_key, title, status, nomer_zayavki, form_state, quote_result,
            recipient_email, agree_token, transport_agreed_at, created_at, updated_at
     from haulz_calc_drafts where agree_token = $1`,
    [t],
  );
  const row = rows[0];
  return row ? mapRowExtended(row) : null;
}

export type ConfirmAgreeResult =
  | { ok: true; already: boolean; draft: HaulzCalcDraftRow }
  | { ok: false; reason: "not_found" | "invalid_status" };

export async function confirmTransportAgree(pool: Pool, token: string): Promise<ConfirmAgreeResult> {
  const draft = await getDraftByAgreeToken(pool, token);
  if (!draft) return { ok: false, reason: "not_found" };

  if (draft.status === "awaiting_call" || draft.status === "agreed") {
    return { ok: true, already: true, draft };
  }

  if (draft.status !== "new") {
    return { ok: false, reason: "invalid_status" };
  }

  await pool.query(
    `update haulz_calc_drafts set
       status = 'awaiting_call',
       transport_agreed_at = now(),
       updated_at = now()
     where agree_token = $1`,
    [token],
  );

  const updated = await getDraftByAgreeToken(pool, token);
  if (!updated) return { ok: false, reason: "not_found" };

  void notifyCalcTransportAgree({
    draftId: updated.id,
    loginKey: updated.loginKey ?? "",
    status: updated.status,
    recipientEmail: updated.recipientEmail,
    title: updated.title,
    totalRub: updated.quoteResult?.totalRub ?? null,
    nomerZayavki: updated.nomerZayavki,
  });

  return { ok: true, already: false, draft: updated };
}

export async function setDraftStatusByManager(
  pool: Pool,
  draftId: number,
  status: HaulzCalcDraftStatus,
): Promise<HaulzCalcDraftRow | null> {
  if (status === "draft") return null;
  const { rows } = await pool.query<DraftDbRow>(
    `update haulz_calc_drafts set status = $2, updated_at = now()
     where id = $1 and status <> 'draft'
     returning id::text, login_key, title, status, nomer_zayavki, form_state, quote_result,
               recipient_email, agree_token, transport_agreed_at, created_at, updated_at`,
    [draftId, status],
  );
  const row = rows[0];
  return row ? mapRowExtended(row) : null;
}

export async function deleteDraftByManager(pool: Pool, draftId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `delete from haulz_calc_drafts where id = $1 and status <> 'draft'`,
    [draftId],
  );
  return (rowCount ?? 0) > 0;
}

export async function listAllCalcDraftsForManager(pool: Pool, limit = 100): Promise<HaulzCalcDraftRow[]> {
  const { rows } = await pool.query<DraftDbRow>(
    `select id::text, login_key, title, status, nomer_zayavki, form_state, quote_result,
            recipient_email, agree_token, transport_agreed_at, created_at, updated_at
     from haulz_calc_drafts
     where status <> 'draft'
     order by updated_at desc
     limit $1`,
    [limit],
  );
  return rows.map(mapRowExtended);
}
