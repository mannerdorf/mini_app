/** Список компаний/заказчиков по логинам. */

import type { CompanyRow } from "../../types";
import { fetchJson } from "./_base";

export async function fetchCompanies(query: string): Promise<CompanyRow[]> {
  const { ok, data } = await fetchJson<{ companies?: CompanyRow[] }>(`/api/companies?${query}`);
  if (!ok) return [];
  return Array.isArray(data.companies) ? data.companies : [];
}

export async function fetchCompaniesByLogin(login: string, accessAll = false): Promise<CompanyRow[]> {
  const q = `login=${encodeURIComponent(login)}${accessAll ? `&access_all=${encodeURIComponent(login)}` : ""}`;
  return fetchCompanies(q);
}
