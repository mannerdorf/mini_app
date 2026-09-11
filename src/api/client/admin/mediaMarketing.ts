import { adminAuthHeaders } from "./auth";

export type MediaSeoChecklistItem = {
  id: number;
  category: string;
  title: string;
  description: string;
  owner_action: string;
  doc_link: string | null;
  sort_order: number;
  is_done: boolean;
  notes: string | null;
  state_updated_at: string | null;
  state_updated_by: string | null;
};

export type MediaContentPlan = {
  id: number;
  planned_date: string;
  title: string;
  brief: string;
  target_keywords: string | null;
  channels: string[];
  status: string;
  article_slug: string | null;
  article_title: string | null;
  meta_description?: string | null;
  body_markdown?: string | null;
  telegram_teaser?: string | null;
  email_subject?: string | null;
  email_teaser?: string | null;
  gpt_model?: string | null;
  generated_at?: string | null;
  published_at?: string | null;
};

export type MediaAdPlacement = {
  id: number;
  placement_type: string;
  partner_name: string;
  contact: string | null;
  platform: string | null;
  description: string | null;
  cost_amount: string | null;
  cost_currency: string;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  utm_campaign: string | null;
  status: string;
  metrics_notes: string | null;
};

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((data as { error?: string })?.error || res.statusText));
  return data;
}

export async function fetchMediaSeoChecklist(adminToken: string) {
  const res = await fetch("/api/admin-media-seo-checklist", { headers: adminAuthHeaders(adminToken) });
  return parseJson(res) as Promise<{
    items: MediaSeoChecklistItem[];
    summary: {
      total: number;
      done: number;
      pending: number;
      pending_owner_actions: Array<{ id: number; title: string; owner_action: string }>;
    };
  }>;
}

export async function patchMediaSeoChecklist(
  adminToken: string,
  payload: { checklist_id: number; is_done: boolean; notes?: string },
) {
  const res = await fetch("/api/admin-media-seo-checklist", {
    method: "PATCH",
    headers: { ...adminAuthHeaders(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function fetchMediaPlans(adminToken: string) {
  const res = await fetch("/api/admin-media-plans", { headers: adminAuthHeaders(adminToken) });
  return parseJson(res) as Promise<{ plans: MediaContentPlan[] }>;
}

export async function fetchMediaPlan(adminToken: string, id: number) {
  const res = await fetch(`/api/admin-media-plans?id=${id}`, { headers: adminAuthHeaders(adminToken) });
  return parseJson(res) as Promise<{ plan: MediaContentPlan }>;
}

export async function createMediaPlan(
  adminToken: string,
  payload: {
    planned_date: string;
    title: string;
    brief: string;
    target_keywords?: string;
    channels: string[];
  },
) {
  const res = await fetch("/api/admin-media-plans", {
    method: "POST",
    headers: { ...adminAuthHeaders(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(res) as Promise<{ plan: MediaContentPlan }>;
}

export async function updateMediaPlan(adminToken: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/admin-media-plans", {
    method: "PATCH",
    headers: { ...adminAuthHeaders(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(res) as Promise<{ plan: MediaContentPlan }>;
}

export async function deleteMediaPlan(adminToken: string, id: number) {
  const res = await fetch(`/api/admin-media-plans?id=${id}`, {
    method: "DELETE",
    headers: adminAuthHeaders(adminToken),
  });
  return parseJson(res);
}

export async function generateMediaPlanArticle(adminToken: string, planId: number) {
  const res = await fetch("/api/admin-media-plans-generate", {
    method: "POST",
    headers: { ...adminAuthHeaders(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: planId }),
  });
  return parseJson(res);
}

export async function fetchMediaAdPlacements(adminToken: string) {
  const res = await fetch("/api/admin-media-ad-placements", { headers: adminAuthHeaders(adminToken) });
  return parseJson(res) as Promise<{ placements: MediaAdPlacement[] }>;
}

export async function createMediaAdPlacement(adminToken: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/admin-media-ad-placements", {
    method: "POST",
    headers: { ...adminAuthHeaders(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(res) as Promise<{ placement: MediaAdPlacement }>;
}

export async function updateMediaAdPlacement(adminToken: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/admin-media-ad-placements", {
    method: "PATCH",
    headers: { ...adminAuthHeaders(adminToken), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(res) as Promise<{ placement: MediaAdPlacement }>;
}

export async function deleteMediaAdPlacement(adminToken: string, id: number) {
  const res = await fetch(`/api/admin-media-ad-placements?id=${id}`, {
    method: "DELETE",
    headers: adminAuthHeaders(adminToken),
  });
  return parseJson(res);
}
