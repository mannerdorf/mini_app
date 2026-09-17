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

export type AdminClaimDetail = {
  claim: {
    id: number;
    requestedAmount: number | string | null;
    approvedAmount: number | string | null;
    claimNumber: string | null;
    customerLogin: string | null;
    customerCompanyName: string | null;
    customerInn: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
    cargoNumber: string | null;
    claimType: string | null;
    description: string | null;
    status: string | null;
    statusChangedAt: string | null;
    slaDueAt: string | null;
    managerLogin: string | null;
    expertLogin: string | null;
    leaderLogin: string | null;
    accountantLogin: string | null;
    managerNote: string | null;
    leaderComment: string | null;
    accountingNote: string | null;
    customerResolution: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  customerPayload: { contactName: string; selectedPlaces: string[]; manipulationSigns: string[]; packagingTypes: string[] };
  claimTypeLabel: string;
  ttnCheck: {orderFound:boolean;sendingFound:boolean;ttnFound:boolean;damageMarksFound:boolean};
  photos: Array<{id:number;fileName?:string;mimeType?:string;base64?:string;caption?:string}>;
  documents: Array<{id:number;fileName?:string;mimeType?:string;base64?:string;docType?:string}>;
  videoLinks: Array<{id:number;url?:string;title?:string}>;
  comments: Array<{id:number;authorLogin?:string;authorRole?:string;commentText?:string;isInternal?:boolean;createdAt?:string}>;
  events: Array<{id:number;actorLogin?:string;actorRole?:string;eventType?:string;fromStatus?:string;toStatus?:string;payload?:unknown;createdAt?:string}>;
};

export async function fetchAdminClaimDetail(
  adminToken: string,
  id: number
): Promise<AdminClaimDetail | null> {
  const res = await fetch(`/api/admin-claim-detail?id=${id}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as AdminClaimDetail & { error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки претензии");
  if (!data.claim || !Number.isFinite(Number(data.claim.id))) throw new Error("Некорректный ответ претензии");
  return data;
}

export async function postAdminClaimUpdate(
  adminToken: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch("/api/admin-claim-update", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  let data: { error?: string } = {};
  try {
    const text = await res.text();
    if (text) data = JSON.parse(text) as { error?: string };
  } catch {
    if (!res.ok) {
      data = { error: res.status === 413 ? "Файл или запрос слишком большой (лимит размера)" : `Ошибка ${res.status}` };
    }
  }
  if (!res.ok) throw new Error(data.error || "Ошибка обновления претензии");
}
