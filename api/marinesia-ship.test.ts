vi.mock('../lib/marinesiaRequest.js',()=>({requestMarinesia:(...args:Parameters<typeof fetch>)=>fetch(...args)}));
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./_lib/observability.js', () => ({ initRequestContext: () => ({ requestId: 'test' }), logError: vi.fn() }));
import handler, { normalizeVesselHistory } from './marinesia-ship';
const mmsi = '273611990';
const old = { mmsi: Number(mmsi), lat: 59.8, lng: 30.1, ts: '2026-10-07T01:00:00', sog: 4 };
const latest = { ...old, lat: 59.9, ts: '2026-10-07T13:00:00', sog: 0 };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function response() { const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res); return res; }
it('filters invalid coordinates and other vessels, then orders the track oldest first', () => {
  expect(normalizeVesselHistory([latest, null, { ...old, lat: 100 }, { ...old, mmsi: 123456789 }, { ...old, valid: false }, { ...old, ts: 'bad' }, old], mmsi)).toEqual([{ ...old, ts: '2026-10-07T01:00:00.000Z' }, { ...latest, ts: '2026-10-07T13:00:00.000Z' }]);
});
it('uses one history request for both current position and track', async () => {
  vi.stubEnv('MARINESIA_API_KEY', 'test-key');
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: false, data: [latest, old] })));
  vi.stubGlobal('fetch', fetchMock);
  const res = response();
  await handler({ method: 'GET', query: { mmsi, history: '1' } } as any, res as any);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe(`/api/v1/vessel/${mmsi}/location`);
  expect(res.status).toHaveBeenCalledWith(200);
  const result = res.json.mock.calls[0][0];
  expect(result.vessel.lat).toBe(latest.lat);
  expect(result.track.map((p: any) => p.lat)).toEqual([old.lat, latest.lat]);
});
it('falls back to latest position when history is denied without losing the map', async () => {
  vi.stubEnv('MARINESIA_API_KEY', 'test-key');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: true }), { status: 403 })).mockResolvedValueOnce(new Response(JSON.stringify({ data: latest }))));
  const res = response();
  await handler({ method: 'GET', query: { mmsi, history: '1' } } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(200);
  const result = res.json.mock.calls[0][0];
  expect(result.track).toEqual([]);
  expect(result.historyError).toContain('История');
  expect(result.vessel.lat).toBe(latest.lat);
});
it('removes a teleport fix and reports breaks to the map', async () => {
  vi.stubEnv('MARINESIA_API_KEY', 'test-key');
  const fixes = [
    { ...old, lat: 55, lng: 19, ts: '2026-10-07T00:00:00' },
    { ...old, lat: 55, lng: 33, ts: '2026-10-07T01:00:00' },
    { ...old, lat: 55, lng: 19.2, ts: '2026-10-07T02:00:00' },
    { ...old, lat: 55, lng: 19.3, ts: '2026-10-07T12:00:00' },
  ];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: fixes }))));
  const res = response(); await handler({ method: 'GET', query: { mmsi, history: '1' } } as any, res as any);
  const result = res.json.mock.calls[0][0]; expect(result.track.map((p: any) => p.lon)).toEqual([19, 19.2, 19.3]); expect(result.track[2].breakBefore).toBe(true); expect(result.historyError).toContain('точек: 1');
});
