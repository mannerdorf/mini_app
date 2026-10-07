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

export type MarinesiaTrackPoint = { lat: number; lon: number; timeUtc: string; breakBefore?: boolean };

export async function fetchMarinesiaShip(mmsi: string, history = false): Promise<{ ok: boolean; vessel?: MarinesiaVessel; error?: string; track?: MarinesiaTrackPoint[]; historyError?: string }> {
  const trimmed = mmsi.trim().replace(/\D/g, "");
  const { ok, data } = await fetchJson<{ vessel?: MarinesiaVessel; error?: string; track?: MarinesiaTrackPoint[]; historyError?: string }>(
    `/api/marinesia-ship?mmsi=${encodeURIComponent(trimmed)}${history ? '&history=1' : ''}`,
  );
  return { ok, vessel: data.vessel, error: data.error, track: data.track, historyError: data.historyError };
}

export async function fetchFerriesList(): Promise<{ id: number; name: string; mmsi: string; api_provider?: string | null }[]> {
  const { ok, data } = await fetchJson<{ ferries?: { id: number; name: string; mmsi: string; api_provider?: string | null }[] }>("/api/ferries-list");
  if (!ok) return [];
  return data.ferries ?? [];
}
