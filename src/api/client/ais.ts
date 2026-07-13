/** AIS / Marinesia / паромы. */

import { fetchJson } from "./_base";

export type MarinesiaVessel = {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  timeUtc?: string;
  dest?: string;
  eta?: string;
  status?: number;
  hdt?: number;
  draught?: number;
};

export async function fetchMarinesiaShip(mmsi: string): Promise<{ ok: boolean; vessel?: MarinesiaVessel; error?: string }> {
  const trimmed = mmsi.trim().replace(/\D/g, "");
  const { ok, data } = await fetchJson<{ vessel?: MarinesiaVessel; error?: string }>(
    `/api/marinesia-ship?mmsi=${encodeURIComponent(trimmed)}`,
  );
  return { ok, vessel: data.vessel, error: data.error };
}

export async function fetchFerriesList(): Promise<{ id: number; name: string; mmsi: string }[]> {
  const { ok, data } = await fetchJson<{ ferries?: { id: number; name: string; mmsi: string }[] }>("/api/ferries-list");
  if (!ok) return [];
  return data.ferries ?? [];
}
