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
