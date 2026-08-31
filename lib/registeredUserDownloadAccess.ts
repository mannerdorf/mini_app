import type { Pool } from "pg";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";
import { assertPartnerDownloadCargoAccess, assertPartnerDownloadInvoiceAccess } from "./partnerDownloadAccess.js";

const INVOICE_DOC_METODS = new Set(["Счет", "Счёт", "РеестрКсчету"]);
const CARGO_CACHE_METODS = new Set(["ЭР", "Акт", "AktSverki", "АктСверки", "Dogovor", "Договор"]);

/** CMS / зарегистрированный пользователь: проверка доступа перед GetFile. */
export async function assertRegisteredUserDownloadAccess(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  metod: string,
  number: string,
  bodyInn?: unknown,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (INVOICE_DOC_METODS.has(metod)) {
    const cacheRow = await pool.query<{ data: unknown[] }>("SELECT data FROM cache_invoices WHERE id = 1");
    if (cacheRow.rows.length === 0) return { ok: true };
    return assertPartnerDownloadInvoiceAccess(pool, verified, null, login, number, bodyInn);
  }

  if (CARGO_CACHE_METODS.has(metod)) {
    const cacheRow = await pool.query<{ data: unknown[] }>("SELECT data FROM cache_perevozki WHERE id = 1");
    if (cacheRow.rows.length === 0) return { ok: true };
    return assertPartnerDownloadCargoAccess(pool, verified, null, login, metod, number, bodyInn);
  }

  return { ok: true };
}
