import type { Pool } from "pg";
import { transportAccessKeysMatch } from "../api/lib/wbPerevozkaDigits.js";
import { canonInnForApiKey } from "./userApiKeyInnFilter.js";
import type { VerifiedRegisteredUser } from "./verifyRegisteredUser.js";

const CARGO_DOC_METODS = new Set(["ЭР", "АПП", "Счет", "Акт", "Счёт"]);

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
  const item = list.find((i: Record<string, unknown>) => {
    if (!transportAccessKeysMatch(i?.Number ?? i?.number ?? "", number)) return false;
    const itemInn = canonInnForApiKey(String(i?.INN ?? i?.Inn ?? i?.inn ?? ""));
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
