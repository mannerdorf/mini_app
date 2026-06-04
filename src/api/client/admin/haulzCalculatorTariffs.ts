export type AdminHaulzTariffSet = {
  id: number;
  code: string;
  name: string;
  block: string;
  direction: string | null;
  active_version?: {
    id: number;
    effective_from: string;
    payload: unknown;
  } | null;
};

function adminHeaders(adminToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken}`,
  };
}

export async function fetchAdminHaulzCalculatorTariffs(adminToken: string): Promise<AdminHaulzTariffSet[]> {
  const res = await fetch("/api/admin-haulz-calculator-tariffs", { headers: adminHeaders(adminToken) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return (data as { sets?: AdminHaulzTariffSet[] }).sets ?? [];
}

export async function publishAdminHaulzTariffVersion(
  adminToken: string,
  tariffSetId: number,
  effectiveFrom: string,
  payload: unknown,
  comment?: string,
): Promise<void> {
  const res = await fetch("/api/admin-haulz-calculator-tariffs", {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: JSON.stringify({ tariff_set_id: tariffSetId, effective_from: effectiveFrom, payload, comment }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
}
