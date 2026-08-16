import type { Pool } from "pg";
import { parseHaulzCalcDraftStatus, type HaulzCalcDraftStatus } from "./draftStatus.js";
import type { MainlineMode, QuoteResult } from "./types.js";

export type { HaulzCalcDraftStatus };

export type HaulzCalculatorFormState = {
  fromQuery: string;
  toQuery: string;
  from: import("./types.js").AddressSelection | null;
  to: import("./types.js").AddressSelection | null;
  fromMode: "courier" | "point";
  toMode: "courier" | "point";
  fromPhone: string;
  toPhone: string;
  customerInn?: string;
  customerCompanyName?: string;
  fromInn: string;
  toInn: string;
  fromCompanyName: string;
  toCompanyName: string;
  fromName: string;
  toName: string;
  places: import("./types.js").ParcelPlace[];
  activePresetIdx: Record<number, string>;
  declaredValue: string;
  mainlineMode: MainlineMode;
  directionOverride: import("./types.js").Direction | null;
  extraCodes: string[];
  dataZabora: string;
  /** Контакт гостя с сайта (без входа в ЛК). */
  guestContactPhone?: string;
  guestContactEmail?: string;
  /** Источник адреса стороны маршрута (заявки из ЛК «Документы»). */
  fromAddressKind?: import("./orderAddressKind.js").OrderLegAddressKind;
  toAddressKind?: import("./orderAddressKind.js").OrderLegAddressKind;
};

export type HaulzCalcDraftRow = {
  id: number;
  title: string | null;
  status: HaulzCalcDraftStatus;
  nomerZayavki: string | null;
  formState: HaulzCalculatorFormState;
  quoteResult: QuoteResult | null;
  recipientEmail?: string | null;
  agreeToken?: string | null;
  transportAgreedAt?: string | null;
  loginKey?: string;
  createdAt: string;
  updatedAt: string;
};

const DRAFT_SELECT = `id::text, login_key, title, status, nomer_zayavki, form_state, quote_result,
  recipient_email, agree_token, transport_agreed_at, created_at, updated_at`;

function draftTitleFromForm(form: HaulzCalculatorFormState): string {
  const from = form.from?.label || form.fromQuery || "—";
  const to = form.to?.label || form.toQuery || "—";
  return `${from} → ${to}`;
}

function mapRow(r: {
  id: string;
  login_key?: string;
  title: string | null;
  status: string;
  nomer_zayavki: string | null;
  form_state: HaulzCalculatorFormState;
  quote_result: QuoteResult | null;
  recipient_email?: string | null;
  agree_token?: string | null;
  transport_agreed_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): HaulzCalcDraftRow {
  return {
    id: Number(r.id),
    title: r.title,
    status: parseHaulzCalcDraftStatus(r.status),
    nomerZayavki: r.nomer_zayavki,
    formState: r.form_state,
    quoteResult: r.quote_result,
    recipientEmail: r.recipient_email ?? null,
    agreeToken: r.agree_token ?? null,
    transportAgreedAt: r.transport_agreed_at ? new Date(r.transport_agreed_at).toISOString() : null,
    loginKey: r.login_key,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function listHaulzCalcDrafts(pool: Pool, loginKey: string): Promise<HaulzCalcDraftRow[]> {
  const { rows } = await pool.query(
    `select ${DRAFT_SELECT}
     from haulz_calc_drafts
     where login_key = $1 and status <> 'draft'
     order by updated_at desc
     limit 50`,
    [loginKey],
  );
  return rows.map(mapRow);
}

/** Незавершённые расчёты, сохранённые кнопкой «Черновик» в калькуляторе. */
export async function listHaulzCalcSavedDrafts(pool: Pool, loginKey: string): Promise<HaulzCalcDraftRow[]> {
  const { rows } = await pool.query(
    `select ${DRAFT_SELECT}
     from haulz_calc_drafts
     where login_key = $1 and status = 'draft'
     order by updated_at desc
     limit 50`,
    [loginKey],
  );
  return rows.map(mapRow);
}

export async function getHaulzCalcDraft(
  pool: Pool,
  loginKey: string,
  id: number,
): Promise<HaulzCalcDraftRow | null> {
  const { rows } = await pool.query(
    `select ${DRAFT_SELECT}
     from haulz_calc_drafts where login_key = $1 and id = $2`,
    [loginKey, id],
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function upsertHaulzCalcDraft(
  pool: Pool,
  loginKey: string,
  input: {
    id?: number;
    title?: string;
    status?: HaulzCalcDraftStatus;
    nomerZayavki?: string;
    formState: HaulzCalculatorFormState;
    quoteResult?: QuoteResult | null;
  },
): Promise<HaulzCalcDraftRow> {
  const title = String(input.title || "").trim() || draftTitleFromForm(input.formState);
  const status = input.status ? parseHaulzCalcDraftStatus(input.status) : "draft";
  const nomer = input.nomerZayavki?.trim() || null;

  if (input.id) {
    const { rows } = await pool.query<{ id: string }>(
      `update haulz_calc_drafts set
         title = $3,
         status = $4,
         nomer_zayavki = $5,
         form_state = $6::jsonb,
         quote_result = $7::jsonb,
         updated_at = now()
       where login_key = $1 and id = $2
       returning id::text`,
      [
        loginKey,
        input.id,
        title,
        status,
        nomer,
        JSON.stringify(input.formState),
        input.quoteResult ? JSON.stringify(input.quoteResult) : null,
      ],
    );
    if (!rows[0]) throw new Error("Черновик не найден");
    const saved = await getHaulzCalcDraft(pool, loginKey, input.id);
    if (!saved) throw new Error("Черновик не найден");
    return saved;
  }

  const { rows } = await pool.query<{ id: string }>(
    `insert into haulz_calc_drafts (login_key, title, status, nomer_zayavki, form_state, quote_result)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     returning id::text`,
    [
      loginKey,
      title,
      status,
      nomer,
      JSON.stringify(input.formState),
      input.quoteResult ? JSON.stringify(input.quoteResult) : null,
    ],
  );
  const id = Number(rows[0]?.id);
  const saved = await getHaulzCalcDraft(pool, loginKey, id);
  if (!saved) throw new Error("Не удалось сохранить черновик");
  return saved;
}

export async function deleteHaulzCalcDraft(pool: Pool, loginKey: string, id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `delete from haulz_calc_drafts where login_key = $1 and id = $2`,
    [loginKey, id],
  );
  return (rowCount ?? 0) > 0;
}
