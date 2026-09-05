import type { Pool } from "pg";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";
import { assertPartnerDownloadCargoAccess, assertPartnerDownloadInvoiceAccess } from "./partnerDownloadAccess.js";

const INVOICE_DOC_METODS = new Set(["РеестрКсчету"]);
/** Как ЭР/АПП: verify пользователя достаточно — кэш не блокирует GetFile. */
const SKIP_CACHE_FOR_REGISTERED = new Set(["ЭР", "АПП", "Счет", "Счёт", "Акт"]);
const CARGO_CACHE_METODS = new Set(["AktSverki", "АктСверки", "Dogovor", "Договор"]);

/**
 * CMS / зарегистрированный пользователь: проверка доступа перед GetFile.
 * Счёт/УПД/ЭР/АПП — без cache (иначе stale cache даёт 404 при живом GetFile).
 * РеестрКсчету — проверка по cache_invoices.
 */
export async function assertRegisteredUserDownloadAccess(
  pool: Pool,
  verified: VerifiedRegisteredUser,
  login: string,
  metod: string,
  number: string,
  bodyInn?: unknown,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (SKIP_CACHE_FOR_REGISTERED.has(metod)) {
    return { ok: true };
  }

  if (INVOICE_DOC_METODS.has(metod)) {
    return assertPartnerDownloadInvoiceAccess(pool, verified, null, login, number, bodyInn);
  }

  if (CARGO_CACHE_METODS.has(metod)) {
    return assertPartnerDownloadCargoAccess(pool, verified, null, login, metod, number, bodyInn);
  }

  return { ok: true };
}
