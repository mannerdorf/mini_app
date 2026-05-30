/**
 * Admin API: пресеты прав пользователей.
 */

import { adminAuthHeaders } from "./auth";

export type AdminPermissionPreset = {
  id: string;
  label: string;
  permissions: Record<string, boolean>;
  financial: boolean;
  serviceMode: boolean;
};

export async function fetchAdminPresets(adminToken: string): Promise<AdminPermissionPreset[]> {
  const res = await fetch("/api/admin-presets", { headers: adminAuthHeaders(adminToken) });
  const data = (await res.json().catch(() => ({}))) as { presets?: AdminPermissionPreset[] };
  return Array.isArray(data.presets) ? data.presets : [];
}

export type SaveAdminPresetPayload = {
  id?: string;
  label: string;
  permissions: Record<string, boolean>;
  financial: boolean;
  serviceMode: boolean;
};

export async function saveAdminPreset(
  adminToken: string,
  payload: SaveAdminPresetPayload
): Promise<void> {
  const res = await fetch("/api/admin-presets", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "Ошибка сохранения");
}

export async function deleteAdminPreset(adminToken: string, id: string): Promise<void> {
  const res = await fetch(`/api/admin-presets?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { deleted?: boolean; error?: string };
  if (res.status < 200 || res.status >= 300 || data.deleted === false) {
    throw new Error(data.error || "Не удалось удалить пресет");
  }
}
