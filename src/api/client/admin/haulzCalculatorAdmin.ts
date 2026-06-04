import type { ExtraServicePayload, PickupMatrixPayload, RingExitRow } from "../../../../lib/haulzCalculator/types";
import {
  fetchAdminHaulzCalculatorTariffs,
  publishAdminHaulzTariffVersion,
  type AdminHaulzTariffSet,
} from "./haulzCalculatorTariffs";

export { fetchAdminHaulzCalculatorTariffs, publishAdminHaulzTariffVersion, type AdminHaulzTariffSet };

function adminHeaders(adminToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  };
}

export type TariffVersionHistory = {
  id: number;
  effective_from: string;
  payload: unknown;
  comment: string | null;
  created_by: string | null;
};

export async function fetchAdminHaulzTariffHistory(
  adminToken: string,
  tariffSetId: number,
): Promise<{ history: TariffVersionHistory[]; active: TariffVersionHistory | null }> {
  const res = await fetch(`/api/admin-haulz-calculator-tariffs?tariff_set_id=${tariffSetId}`, {
    headers: adminHeaders(adminToken),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return {
    history: (data as { history?: TariffVersionHistory[] }).history ?? [],
    active: (data as { active?: TariffVersionHistory | null }).active ?? null,
  };
}

export async function importAdminHaulzFile(
  adminToken: string,
  kind: "pickup_xlsx" | "mkad_mxl",
  file: File,
  effectiveFrom?: string,
): Promise<void> {
  const b64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result || "");
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const res = await fetch("/api/admin-haulz-calculator-import", {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: JSON.stringify({ kind, content_base64: b64, effective_from: effectiveFrom }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
}

export async function fetchAdminRingExits(
  adminToken: string,
  city?: "moscow" | "kaliningrad",
): Promise<RingExitRow[]> {
  const q = city ? `?city=${city}` : "";
  const res = await fetch(`/api/admin-haulz-calculator-ring${q}`, { headers: adminHeaders(adminToken) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return (data as { exits?: RingExitRow[] }).exits ?? [];
}

export async function saveAdminRingExit(
  adminToken: string,
  exit: Partial<RingExitRow> & { city_code: "moscow" | "kaliningrad"; name: string; lat: number; lon: number },
): Promise<void> {
  const res = await fetch("/api/admin-haulz-calculator-ring", {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: JSON.stringify(exit),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
}

export type HubRow = {
  id: number;
  code: string;
  name: string;
  lat: number;
  lon: number;
  role: "moscow" | "kaliningrad";
  active: boolean;
};

export async function fetchAdminHubs(adminToken: string): Promise<HubRow[]> {
  const res = await fetch("/api/admin-haulz-calculator-hubs", { headers: adminHeaders(adminToken) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return (data as { hubs?: HubRow[] }).hubs ?? [];
}

export async function saveAdminHub(
  adminToken: string,
  hub: Partial<HubRow> & { code: string; name: string; lat: number; lon: number; role: "moscow" | "kaliningrad" },
): Promise<void> {
  const res = await fetch("/api/admin-haulz-calculator-hubs", {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: JSON.stringify(hub),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
}

export type PickupPayload = PickupMatrixPayload;
export type ExtrasPayload = { services: ExtraServicePayload[] };
