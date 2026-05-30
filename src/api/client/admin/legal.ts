/**
 * Admin API: оферта и согласие на обработку ПД.
 */

import { adminAuthHeaders } from "./auth";

export type AdminLegalVersionRow = {
  id: number;
  document_type: string;
  version_label: string;
  published_at: string | null;
  is_current: boolean;
  created_at: string;
  body_length: number;
};

export type AdminLegalJournalRow = {
  id: number;
  login: string;
  document_type: string;
  version_label: string;
  accepted_at: string;
  company_name: string;
};

export type AdminLegalSummaryRow = {
  login: string;
  company_name: string;
  offer_version_label: string | null;
  offer_accepted_at: string | null;
  consent_version_label: string | null;
  consent_accepted_at: string | null;
};

export type AdminLegalCurrent = {
  offer: { version_label: string } | null;
  consent: { version_label: string } | null;
};

export type AdminLegalDocumentsResponse = {
  versions: AdminLegalVersionRow[];
  journal: AdminLegalJournalRow[];
  summary: AdminLegalSummaryRow[];
  current: AdminLegalCurrent;
};

async function adminLegalJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

export async function fetchAdminLegalDocuments(
  adminToken: string,
  opts?: { journalSearch?: string }
): Promise<AdminLegalDocumentsResponse> {
  const params = new URLSearchParams();
  const q = opts?.journalSearch?.trim();
  if (q) params.set("q", q);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/admin-legal-documents${suffix}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = await adminLegalJson<Partial<AdminLegalDocumentsResponse>>(res);
  return {
    versions: data.versions || [],
    journal: data.journal || [],
    summary: data.summary || [],
    current: data.current || { offer: null, consent: null },
  };
}

export async function publishAdminLegalDocument(
  adminToken: string,
  payload: {
    document_type: "offer" | "consent";
    version_label: string;
    body_text: string;
  }
): Promise<void> {
  const res = await fetch("/api/admin-legal-documents", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  await adminLegalJson(res);
}
