/** Each listed account must prove its own identity; credentials never enter the URL. */
import type { CompanyRow } from "../../types";
import { fetchJson, type LoginPasswordAuth } from "./_base";

export async function fetchCompanies(accounts: LoginPasswordAuth[]): Promise<CompanyRow[]> {
  if (!accounts.length) return [];
  const { ok, data } = await fetchJson<{ companies?: CompanyRow[]; error?: string }>("/api/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accounts: accounts.map(({ login, password }) => ({ login, password })) }),
  });
  if (!ok) throw new Error(data.error || "Не удалось загрузить компании");
  return Array.isArray(data.companies) ? data.companies : [];
}
