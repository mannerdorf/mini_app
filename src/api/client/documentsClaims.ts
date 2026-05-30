import { documentsAuthHeaders, documentsFetchJson, type DocumentsAuth } from "./documentsAuth";

export type ClaimsListParams = {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  inn?: string;
};

export async function fetchClaimsList(
  auth: DocumentsAuth,
  params: ClaimsListParams
): Promise<unknown[]> {
  const qs = new URLSearchParams();
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.inn) qs.set("inn", params.inn);
  const suffix = qs.toString() ? `?${qs}` : "";
  const { ok, data } = await documentsFetchJson<{ claims?: unknown[] }>(
    `/api/claims${suffix}`,
    { method: "GET", headers: documentsAuthHeaders(auth, { "x-inn": params.inn || auth.inn || "" }) }
  );
  if (!ok) return [];
  return Array.isArray(data.claims) ? data.claims : [];
}

export async function fetchClaimById(auth: DocumentsAuth, claimId: number): Promise<{
  ok: boolean;
  data: Record<string, unknown>;
}> {
  return documentsFetchJson(`/api/claims/${claimId}`, {
    method: "GET",
    headers: documentsAuthHeaders(auth),
  });
}

export async function postClaimAction(
  auth: DocumentsAuth,
  claimId: number,
  body: Record<string, unknown>
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  return documentsFetchJson(`/api/claims/${claimId}`, {
    method: "POST",
    headers: documentsAuthHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
}

export async function saveClaimDraft(
  auth: DocumentsAuth,
  claimId: number | null,
  body: Record<string, unknown>
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const url = claimId ? `/api/claims/${claimId}` : "/api/claims";
  const payload = claimId ? { action: "update_draft", ...body } : body;
  return documentsFetchJson(url, {
    method: "POST",
    headers: documentsAuthHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
}
