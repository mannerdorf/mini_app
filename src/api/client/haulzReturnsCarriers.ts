import type { AuthData } from "../../types";
import type { HaulzCarrier, HaulzCarrierInput } from "../../../lib/haulzReturns/carriers";

function authHeaders(auth: AuthData): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-login": auth.login,
    "x-password": auth.password,
  };
}

function parseJson(res: Response, data: unknown): string {
  if (typeof (data as { error?: string })?.error === "string") return (data as { error: string }).error;
  return `HTTP ${res.status}`;
}

export async function listHaulzCarriers(auth: AuthData): Promise<HaulzCarrier[]> {
  const res = await fetch("/api/haulz-returns/carriers", { headers: authHeaders(auth) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[перевозчики] ${parseJson(res, data)}`);
  return (data as { carriers?: HaulzCarrier[] }).carriers ?? [];
}

export async function createHaulzCarrier(auth: AuthData, input: HaulzCarrierInput): Promise<HaulzCarrier> {
  const res = await fetch("/api/haulz-returns/carriers", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[создание перевозчика] ${parseJson(res, data)}`);
  const carrier = (data as { carrier?: HaulzCarrier }).carrier;
  if (!carrier) throw new Error("[создание перевозчика] Пустой ответ");
  return carrier;
}

export async function updateHaulzCarrier(
  auth: AuthData,
  carrierId: string,
  input: HaulzCarrierInput,
): Promise<HaulzCarrier> {
  const res = await fetch(`/api/haulz-returns/carriers?carrierId=${encodeURIComponent(carrierId)}`, {
    method: "PATCH",
    headers: authHeaders(auth),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`[обновление перевозчика] ${parseJson(res, data)}`);
  const carrier = (data as { carrier?: HaulzCarrier }).carrier;
  if (!carrier) throw new Error("[обновление перевозчика] Пустой ответ");
  return carrier;
}
