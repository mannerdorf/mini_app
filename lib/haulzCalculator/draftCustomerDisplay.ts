import type { HaulzCalculatorFormState } from "./calculatorDraft.js";
import type { HaulzCalcDraftRow } from "./calculatorDraft.js";

/** Подпись заказчика для менеджера: компания + ИНН, иначе логин ЛК. */
export function formatHaulzCalcDraftCustomer(
  formState: HaulzCalculatorFormState | null | undefined,
  loginKey?: string | null,
): string {
  const name = String(formState?.customerCompanyName ?? "").trim();
  const inn = String(formState?.customerInn ?? "").replace(/\D/g, "").trim();
  if (name && inn) return `${name} · ИНН ${inn}`;
  if (name) return name;
  if (inn) return `ИНН ${inn}`;
  const login = String(loginKey ?? "").trim();
  return login || "—";
}

export async function resolveDocumentsCustomerName(
  pool: import("pg").Pool,
  loginKey: string,
  customerInn: string,
  customerName?: string | null,
): Promise<string | undefined> {
  const trimmed = String(customerName ?? "").trim();
  if (trimmed) return trimmed;

  const inn = String(customerInn ?? "").replace(/\D/g, "").trim();
  if (!inn) return undefined;

  const { rows } = await pool.query<{ name: string | null }>(
    `SELECT name FROM account_companies WHERE login = $1 AND inn = $2 LIMIT 1`,
    [loginKey.trim().toLowerCase(), inn],
  );
  const fromAccount = String(rows[0]?.name ?? "").trim();
  if (fromAccount) return fromAccount;

  const { rows: ruRows } = await pool.query<{ company_name: string | null }>(
    `SELECT company_name FROM registered_users WHERE lower(trim(login)) = $1 LIMIT 1`,
    [loginKey.trim().toLowerCase()],
  );
  const fromProfile = String(ruRows[0]?.company_name ?? "").trim();
  return fromProfile || undefined;
}

/** Подставляет название заказчика из account_companies для старых черновиков. */
export async function enrichDraftCustomerFields(
  pool: import("pg").Pool,
  draft: HaulzCalcDraftRow,
): Promise<HaulzCalcDraftRow> {
  const fs = draft.formState;
  const inn = String(fs.customerInn ?? "").replace(/\D/g, "").trim();
  const hasName = Boolean(String(fs.customerCompanyName ?? "").trim());
  if (hasName || !inn || !draft.loginKey) return draft;

  const name = await resolveDocumentsCustomerName(pool, draft.loginKey, inn, fs.customerCompanyName);
  if (!name) return draft;

  return {
    ...draft,
    formState: {
      ...fs,
      customerCompanyName: name,
      customerInn: inn,
    },
  };
}
