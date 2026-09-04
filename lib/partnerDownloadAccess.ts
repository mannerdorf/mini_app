import type { Pool } from "pg";
import { transportAccessKeysMatch } from "../api/lib/wbPerevozkaDigits.js";
import { normalizeCompanyName, normalizeOrderInn } from "./orderCustomerScope.js";
import { resolvePerevozkiRolesForInns } from "./perevozkiPartyMatch.js";
import { canonInnForApiKey } from "./userApiKeyInnFilter.js";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";

const CARGO_DOC_METODS = new Set(["ЭР", "АПП", "Счет", "Акт", "Счёт"]);

async function loadPartyNameNormsForInns(pool: Pool, inns: Set<string>): Promise<Set<string>> {
  const out = new Set<string>();
  if (inns.size === 0) return out;
  const innList = Array.from(inns);
  try {
    const [customers, accounts] = await Promise.all([
      pool.query<{ customer_name: string }>(
        `select customer_name from cache_customers where trim(inn) = any($1::text[])`,
        [innList],
      ),
      pool.query<{ name: string }>(
        `select name from account_companies where trim(inn) = any($1::text[])`,
        [innList],
      ),
    ]);
    for (const row of customers.rows) {
      const n = normalizeCompanyName(row.customer_name);
      if (n) out.add(n);
    }
    for (const row of accounts.rows) {
      const n = normalizeCompanyName(row.name);
      if (n) out.add(n);
    }
  } catch {
    /* справочники могут отсутствовать */
  }
  return out;
}

/** ИНН для проверки доступа — та же логика, что readRegisteredPerevozkiFromCache. */
async function buildFinalInnsForRegisteredUser(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  bodyInn?: unknown,
): Promise<Set<string> | null> {
  if (verified.accessAllInns) return null;

  const acRows = await pool.query<{ inn: string }>(
    "SELECT inn FROM account_companies WHERE login = $1",
    [String(login).trim().toLowerCase()],
  );
  const allowed = new Set<string>();
  for (const row of acRows.rows) {
    const inn = normalizeOrderInn(row.inn);
    if (inn) allowed.add(inn);
  }
  if (verified.inn) {
    const inn = normalizeOrderInn(verified.inn);
    if (inn) allowed.add(inn);
  }

  const requestedInn = bodyInn != null && String(bodyInn).trim() !== "" ? normalizeOrderInn(bodyInn) : null;
  if (requestedInn) {
    return allowed.has(requestedInn) ? new Set([requestedInn]) : new Set();
  }
  if (allowed.size > 0) return allowed;
  if (verified.inn) {
    const inn = normalizeOrderInn(verified.inn);
    return inn ? new Set([inn]) : new Set();
  }
  return new Set();
}

async function cargoMatchesRegisteredUser(
  pool: Pool,
  item: Record<string, unknown>,
  finalInns: Set<string> | null,
): Promise<boolean> {
  if (finalInns === null) return true;
  if (finalInns.size === 0) return false;
  const nameNorms = await loadPartyNameNormsForInns(pool, finalInns);
  return resolvePerevozkiRolesForInns(item, finalInns, nameNorms).length > 0;
}

function invoiceNumbersMatch(a: string, b: string): boolean {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const strip = (s: string) => s.replace(/^0+/, "") || s;
  return strip(left) === strip(right);
}

/** Проверка доступа к счёту перед скачиванием реестра через Partner API. */
export async function assertPartnerDownloadInvoiceAccess(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  keyAllowedInnsCanon: string[] | null,
  login: string,
  invoiceNumber: string,
  bodyInn?: unknown,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const filterInn = bodyInn != null && String(bodyInn).trim() !== "" ? canonInnForApiKey(String(bodyInn)) : null;
  if (keyAllowedInnsCanon && keyAllowedInnsCanon.length > 0) {
    if (filterInn && !keyAllowedInnsCanon.includes(filterInn)) {
      return { ok: false, status: 403, error: "ИНН не разрешён для этого API-ключа" };
    }
  }

  const cacheRow = await pool.query<{ data: unknown[] }>("SELECT data FROM cache_invoices WHERE id = 1");
  if (cacheRow.rows.length === 0) {
    return { ok: false, status: 404, error: "Счёт не найден или нет доступа" };
  }

  const data = cacheRow.rows[0].data as unknown[];
  const list = Array.isArray(data) ? data : [];
  type InvoiceRow = { Number?: unknown; number?: unknown; INN?: unknown; Inn?: unknown; inn?: unknown };
  const item = list.find((i): i is InvoiceRow => {
    if (!i || typeof i !== "object") return false;
    const rec = i as InvoiceRow;
    return invoiceNumbersMatch(String(rec.Number ?? rec.number ?? ""), invoiceNumber);
  });

  if (!item) {
    return { ok: false, status: 404, error: "Счёт не найден или нет доступа" };
  }

  const itemInn = canonInnForApiKey(String(item.INN ?? item.Inn ?? item.inn ?? ""));
  if (keyAllowedInnsCanon && keyAllowedInnsCanon.length > 0) {
    if (!itemInn || !keyAllowedInnsCanon.includes(itemInn)) {
      return { ok: false, status: 404, error: "Счёт не найден или нет доступа" };
    }
  } else if (filterInn) {
    if (itemInn !== filterInn) {
      return { ok: false, status: 404, error: "Счёт не найден или нет доступа" };
    }
  } else if (!verified.accessAllInns) {
    const acRows = await pool.query<{ inn: string }>(
      "SELECT inn FROM account_companies WHERE login = $1",
      [String(login).trim().toLowerCase()],
    );
    const allowed = new Set<string>(
      acRows.rows.map((r) => canonInnForApiKey(r.inn)).filter(Boolean) as string[]
    );
    if (verified.inn) allowed.add(canonInnForApiKey(verified.inn));
    if (itemInn && allowed.size > 0 && !allowed.has(itemInn)) {
      return { ok: false, status: 404, error: "Счёт не найден или нет доступа" };
    }
  }

  return { ok: true };
}

/** Проверка доступа к перевозке перед скачиванием документа через Partner API. */
export async function assertPartnerDownloadCargoAccess(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  keyAllowedInnsCanon: string[] | null,
  login: string,
  metod: string,
  number: string,
  bodyInn?: unknown,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!CARGO_DOC_METODS.has(metod)) {
    return { ok: true };
  }

  const filterInn = bodyInn != null && String(bodyInn).trim() !== "" ? canonInnForApiKey(String(bodyInn)) : null;
  if (keyAllowedInnsCanon && keyAllowedInnsCanon.length > 0) {
    if (filterInn && !keyAllowedInnsCanon.includes(filterInn)) {
      return { ok: false, status: 403, error: "ИНН не разрешён для этого API-ключа" };
    }
  }

  const cacheRow = await pool.query<{ data: unknown[] }>("SELECT data FROM cache_perevozki WHERE id = 1");
  if (cacheRow.rows.length === 0) {
    return { ok: false, status: 404, error: "Перевозка не найдена или нет доступа" };
  }

  const data = cacheRow.rows[0].data as unknown[];
  const list = Array.isArray(data) ? data : [];
  type CargoRow = Record<string, unknown> & { Number?: unknown; number?: unknown };

  const item = list.find((i): i is CargoRow => {
    if (!i || typeof i !== "object") return false;
    const rec = i as CargoRow;
    return transportAccessKeysMatch(rec.Number ?? rec.number ?? "", number);
  });

  if (!item) {
    return { ok: false, status: 404, error: "Перевозка не найдена или нет доступа" };
  }

  if (keyAllowedInnsCanon && keyAllowedInnsCanon.length > 0) {
    const keyInns = new Set(keyAllowedInnsCanon.map(canonInnForApiKey).filter(Boolean));
    const roles = resolvePerevozkiRolesForInns(item, keyInns);
    if (roles.length === 0) {
      return { ok: false, status: 404, error: "Перевозка не найдена или нет доступа" };
    }
    return { ok: true };
  }

  const finalInns = await buildFinalInnsForRegisteredUser(pool, verified, login, bodyInn);
  if (!(await cargoMatchesRegisteredUser(pool, item, finalInns))) {
    return { ok: false, status: 404, error: "Перевозка не найдена или нет доступа" };
  }

  return { ok: true };
}
