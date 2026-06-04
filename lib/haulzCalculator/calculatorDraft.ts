import type { Pool } from "pg";
import type { MainlineMode, QuoteResult } from "./types.js";

export type HaulzCalculatorFormState = {
  fromQuery: string;
  toQuery: string;
  from: import("./types.js").AddressSelection | null;
  to: import("./types.js").AddressSelection | null;
  fromMode: "courier" | "point";
  toMode: "courier" | "point";
  fromPhone: string;
  toPhone: string;
  fromInn: string;
  toInn: string;
  fromName: string;
  toName: string;
  places: import("./types.js").ParcelPlace[];
  activePresetIdx: Record<number, string>;
  declaredValue: string;
  mainlineMode: MainlineMode;
  directionOverride: import("./types.js").Direction | null;
  extraCodes: string[];
  dataZabora: string;
};

export type HaulzCalcDraftRow = {
  id: number;
  title: string | null;
  status: "draft" | "submitted";
  nomerZayavki: string | null;
  formState: HaulzCalculatorFormState;
  quoteResult: QuoteResult | null;
  createdAt: string;
  updatedAt: string;
};

function draftTitleFromForm(form: HaulzCalculatorFormState): string {
  const from = form.from?.label || form.fromQuery || "—";
  const to = form.to?.label || form.toQuery || "—";
  return `${from} → ${to}`;
}

function mapRow(r: {
  id: string;
  title: string | null;
  status: string;
  nomer_zayavki: string | null;
  form_state: HaulzCalculatorFormState;
  quote_result: QuoteResult | null;
  created_at: Date | string;
  updated_at: Date | string;
}): HaulzCalcDraftRow {
  return {
    id: Number(r.id),
    title: r.title,
    status: r.status === "submitted" ? "submitted" : "draft",
    nomerZayavki: r.nomer_zayavki,
    formState: r.form_state,
    quoteResult: r.quote_result,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function listHaulzCalcDrafts(pool: Pool, loginKey: string): Promise<HaulzCalcDraftRow[]> {
  const { rows } = await pool.query<{
    id: string;
    title: string | null;
    status: string;
    nomer_zayavki: string | null;
    form_state: HaulzCalculatorFormState;
    quote_result: QuoteResult | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `select id::text, title, status, nomer_zayavki, form_state, quote_result, created_at, updated_at
     from haulz_calc_drafts
     where login_key = $1
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
  const { rows } = await pool.query<{
    id: string;
    title: string | null;
    status: string;
    nomer_zayavki: string | null;
    form_state: HaulzCalculatorFormState;
    quote_result: QuoteResult | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `select id::text, title, status, nomer_zayavki, form_state, quote_result, created_at, updated_at
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
    status?: "draft" | "submitted";
    nomerZayavki?: string;
    formState: HaulzCalculatorFormState;
    quoteResult?: QuoteResult | null;
  },
): Promise<HaulzCalcDraftRow> {
  const title = String(input.title || "").trim() || draftTitleFromForm(input.formState);
  const status = input.status === "submitted" ? "submitted" : "draft";
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
