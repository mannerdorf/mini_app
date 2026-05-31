/**
 * Admin API: претензии (список, KPI, график).
 */

import { adminAuthHeaders } from "./auth";

export type AdminClaimRow = {
  id: number;
  claimNumber: string;
  customerCompanyName: string;
  customerInn: string;
  cargoNumber: string;
  description: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  status: string;
  daysInWork: number;
  createdAt: string;
};

export type AdminClaimsKpi = {
  activeCount: number;
  overdueCount: number;
  requestedSum: number;
  approvedSum: number;
};

export type AdminClaimsChartPoint = { day: string; count: number };

export type AdminClaimsListResponse = {
  claims: AdminClaimRow[];
  kpi: AdminClaimsKpi | null;
  chart: AdminClaimsChartPoint[];
};

export type AdminClaimsListFilters = {
  status?: string;
  q?: string;
};

export async function fetchAdminClaims(
  adminToken: string,
  filters?: AdminClaimsListFilters
): Promise<AdminClaimsListResponse> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.q?.trim()) params.set("q", filters.q.trim());
  const qs = params.toString();
  const res = await fetch(`/api/admin-claims${qs ? `?${qs}` : ""}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as {
    claims?: AdminClaimRow[];
    kpi?: AdminClaimsKpi | null;
    chart?: AdminClaimsChartPoint[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки претензий");
  return {
    claims: Array.isArray(data.claims) ? data.claims : [],
    kpi: data.kpi || null,
    chart: Array.isArray(data.chart) ? data.chart : [],
  };
}
