import type { Pool } from "pg";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";
import { assertPartnerDownloadCargoAccess, assertPartnerDownloadInvoiceAccess } from "./partnerDownloadAccess.js";

const INVOICE_DOC_METODS = new Set(["Счет", "Счёт", "РеестрКсчету"]);
/** GetFile через Haulz auth — достаточно verify пользователя (как АПП в WB). */
const SKIP_CACHE_FOR_REGISTERED = new Set(["ЭР", "АПП"]);
const CARGO_CACHE_METODS = new Set(["Акт", "AktSverki", "АктСверки", "Dogovor", "Договор"]);

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * CMS / зарегистрированный пользователь: проверка доступа перед GetFile.
 * Не делаем «пустых» SELECT data FROM cache_* — assertPartner* уже грузит кэш один раз.
 * Для Счёта по номеру перевозки сразу идём в cache_perevozki (типичный кейс из UI).
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
    const isSchet = metod === "Счет" || metod === "Счёт";
    // Номер перевозки обычно ≥6 цифр (часто padded до 9). Номер счёта/реестра короче.
    const preferCargo = isSchet && digitsOnly(number).length >= 6;

    if (preferCargo) {
      const cargoAccess = await assertPartnerDownloadCargoAccess(
        pool,
        verified,
        null,
        login,
        metod,
        number,
        bodyInn,
      );
      if (cargoAccess.ok) return cargoAccess;
      return assertPartnerDownloadInvoiceAccess(pool, verified, null, login, number, bodyInn);
    }

    const invoiceAccess = await assertPartnerDownloadInvoiceAccess(
      pool,
      verified,
      null,
      login,
      number,
      bodyInn,
    );
    if (invoiceAccess.ok) return invoiceAccess;
    if (isSchet) {
      return assertPartnerDownloadCargoAccess(pool, verified, null, login, metod, number, bodyInn);
    }
    return invoiceAccess;
  }

  if (CARGO_CACHE_METODS.has(metod)) {
    return assertPartnerDownloadCargoAccess(pool, verified, null, login, metod, number, bodyInn);
  }

  return { ok: true };
}
