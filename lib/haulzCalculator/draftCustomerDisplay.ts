import type { HaulzCalculatorFormState } from "./calculatorDraft.js";
import type { HaulzCalcDraftRow } from "./calculatorDraft.js";

/** Подпись заказчика для менеджера: компания + ИНН, иначе логин ЛК. */
export function formatHaulzCalcDraftCustomer(
  formState: HaulzCalculatorFormState | null | undefined,
  loginKey?: string | null,
): string {
  const guestEmail = String(formState?.guestContactEmail ?? "").trim();
  const guestPhone = String(formState?.guestContactPhone ?? "").trim();
  if (loginKey === "__guest__" || loginKey === "") {
    if (guestEmail && guestPhone) return `${guestEmail} · ${guestPhone}`;
    if (guestEmail) return guestEmail;
    if (guestPhone) return guestPhone;
    return "Гость (сайт)";
  }

  const name = String(formState?.customerCompanyName ?? "").trim();
  const inn = String(formState?.customerInn ?? "").replace(/\D/g, "").trim();
  if (name && inn) return `${name} · ИНН ${inn}`;
  if (name) return name;
  if (inn) return `ИНН ${inn}`;
  const login = String(loginKey ?? "").trim();
  return login || "—";
}

/**
 * Для журнала: компанию без « · ИНН …» оставляем короткой,
 * а гостевой «email · телефон» не обрезаем.
 */
export function journalCustomerDisplayName(
  customerLabel: string,
  preferredName?: string | null,
): string {
  const preferred = String(preferredName ?? "").trim();
  if (preferred) return preferred;
  const label = String(customerLabel ?? "").trim();
  if (!label) return "—";
  const sep = label.indexOf(" · ");
  if (sep < 0) return label;
  const right = label.slice(sep + 3).trim();
  if (/^ИНН(\s|$)/i.test(right)) return label.slice(0, sep).trim() || label;
  return label;
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
