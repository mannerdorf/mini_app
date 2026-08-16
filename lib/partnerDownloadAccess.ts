import type { Pool } from "pg";
import { transportAccessKeysMatch } from "../api/lib/wbPerevozkaDigits.js";
import { canonInnForApiKey } from "./userApiKeyInnFilter.js";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";

const CARGO_DOC_METODS = new Set(["ЭР", "АПП", "Счет", "Акт", "Счёт"]);

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
  type CargoRow = { Number?: unknown; number?: unknown; INN?: unknown; Inn?: unknown; inn?: unknown };
  const item = list.find((i): i is CargoRow => {
    if (!i || typeof i !== "object") return false;
    const rec = i as CargoRow;
    if (!transportAccessKeysMatch(rec.Number ?? rec.number ?? "", number)) return false;
    const itemInn = canonInnForApiKey(String(rec.INN ?? rec.Inn ?? rec.inn ?? ""));
    if (keyAllowedInnsCanon && keyAllowedInnsCanon.length > 0) {
      return itemInn ? keyAllowedInnsCanon.includes(itemInn) : false;
    }
    if (filterInn) return itemInn === filterInn;
    if (verified.accessAllInns) return true;
    const userInn = verified.inn ? canonInnForApiKey(verified.inn) : "";
    return itemInn === userInn;
  });

  if (!item) {
    return { ok: false, status: 404, error: "Перевозка не найдена или нет доступа" };
  }

  return { ok: true };
}
