/**
 * Admin API: справочники паромов и ПВЗ (CMS).
 */

import { adminAuthHeaders } from "./auth";

export type AdminFerryRow = {
  id: number;
  name: string;
  mmsi: string;
  imo: string | null;
  vessel_type: string | null;
  teu_capacity: number | null;
  trailer_capacity: number | null;
  operator: string | null;
};

export type AdminPvzRow = {
  ВладелецИНН: string;
  ВладелецНаименование: string;
  Ссылка: string;
  Наименование: string;
  КодДляПечати: string;
  РегионНаименование: string;
  ГородНаименование: string;
  КонтактноеЛицо: string;
  ОтправительПолучательНаименование: string;
};

export async function fetchAdminFerries(adminToken: string): Promise<AdminFerryRow[]> {
  const res = await fetch("/api/ferries", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as { ferries?: AdminFerryRow[] };
  return data.ferries || [];
}

export async function saveAdminFerry(
  adminToken: string,
  payload: { name: string; mmsi: string; id?: number }
): Promise<void> {
  const res = await fetch("/api/ferries", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || "Ошибка сохранения");
}

export async function deleteAdminFerry(adminToken: string, id: number): Promise<void> {
  const res = await fetch(`/api/ferries?id=${id}`, {
    method: "DELETE",
    headers: adminAuthHeaders(adminToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || "Ошибка удаления");
}

export async function enrichAdminFerriesMarinesia(
  adminToken: string
): Promise<{ updated: number; total: number }> {
  const res = await fetch("/api/ferries-enrich-marinesia", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({}),
  });
  const data = (await res.json().catch(() => ({}))) as { updated?: number; total?: number; error?: string };
  if (!res.ok) throw new Error(data.error || "Ошибка");
  return { updated: Number(data.updated ?? 0), total: Number(data.total ?? 0) };
}

export async function fetchAdminPvzList(adminToken: string): Promise<AdminPvzRow[]> {
  const res = await fetch("/api/pvz", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as { pvz?: AdminPvzRow[] };
  return data.pvz || [];
}
