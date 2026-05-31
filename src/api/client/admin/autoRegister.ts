/**
 * Admin API: кандидаты на автoregистрацию заказчиков.
 */

import { adminAuthHeaders } from "./auth";

export type AdminAutoRegisterCandidate = {
  inn: string;
  customer_name: string;
  email: string;
};

export type AdminAutoRegisterStats = {
  total: number;
  withEmail: number;
  validEmail: number;
  alreadyRegistered: number;
};

export type AdminAutoRegisterCandidatesResponse = {
  candidates: AdminAutoRegisterCandidate[];
  stats: AdminAutoRegisterStats | null;
  auto_mode_enabled: boolean;
};

export async function fetchAdminAutoRegisterCandidates(
  adminToken: string,
  opts?: { q?: string }
): Promise<AdminAutoRegisterCandidatesResponse> {
  const params = new URLSearchParams();
  const q = opts?.q?.trim();
  if (q && q.length >= 2) params.set("q", q);
  const qs = params.toString();
  const res = await fetch(`/api/admin-auto-register-candidates${qs ? `?${qs}` : ""}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminAutoRegisterCandidatesResponse> & {
    error?: string;
  };
  if (data.error) throw new Error(String(data.error));
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки кандидатов");
  return {
    candidates: Array.isArray(data.candidates) ? data.candidates : [],
    stats: data.stats || null,
    auto_mode_enabled: Boolean(data.auto_mode_enabled),
  };
}

export type AdminAutoRegisterBatchResult = {
  processed: number;
  created: number;
  skipped_existing: number;
  email_sent: number;
  email_failed: number;
  remaining_candidates: number;
  run_limit: number;
  email_delay_ms: number;
  email_jitter_ms: number;
};

export async function runAdminAutoRegisterBatch(
  adminToken: string,
  limit: number
): Promise<AdminAutoRegisterBatchResult> {
  const res = await fetch("/api/admin-auto-register-candidates", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({ limit }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<AdminAutoRegisterBatchResult> & { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка запуска авто-регистрации");
  return {
    processed: Number(data.processed || 0),
    created: Number(data.created || 0),
    skipped_existing: Number(data.skipped_existing || 0),
    email_sent: Number(data.email_sent || 0),
    email_failed: Number(data.email_failed || 0),
    remaining_candidates: Number(data.remaining_candidates || 0),
    run_limit: Number(data.run_limit || 0),
    email_delay_ms: Number(data.email_delay_ms || 0),
    email_jitter_ms: Number(data.email_jitter_ms || 0),
  };
}
