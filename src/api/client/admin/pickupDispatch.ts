import { adminAuthHeaders } from "./auth";
import type { Route } from "../../../../lib/pickup/model";

export type AdminPickupRouteRow = {
  id: string;
  name: string;
  city: string;
  date: string;
  status: Route["status"];
  version: number;
  start_time: string;
  driverName: string;
  vehiclePlate: string;
  jobCount: number;
  collectedCount: number;
};

async function postAdminPickup<T>(
  adminToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("/api/admin-pickup-dispatch", {
    method: "POST",
    headers: adminAuthHeaders(adminToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: string })?.error === "string"
        ? (data as { error: string }).error
        : "Ошибка запроса диспетчеризации";
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchAdminPickupDispatchSnapshot(
  adminToken: string,
  params: { city: "moscow" | "kaliningrad"; date: string },
): Promise<{ routes: AdminPickupRouteRow[] }> {
  return postAdminPickup(adminToken, { action: "snapshot", ...params });
}

export async function adminDeleteCompletedPickupRoute(
  adminToken: string,
  params: { id: string; version: number },
): Promise<{ ok: true }> {
  return postAdminPickup(adminToken, { action: "delete_route", ...params });
}
