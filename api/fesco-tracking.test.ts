import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ authorized: true, provider: 'FESCO', request: vi.fn(), query: vi.fn() }));
vi.mock('./_db.js', () => ({ getPool: () => ({ query: state.query }) }));
vi.mock('../lib/verifyRegisteredUser.js', () => ({ verifyRegisteredUser: async () => state.authorized ? {} : null }));
vi.mock('../lib/fesco/tracking.js', async importOriginal => ({ ...await importOriginal<any>(), requestFescoTracking: state.request }));
import handler from './fesco-tracking';
beforeEach(() => { state.authorized = true; state.provider = 'FESCO'; state.query.mockImplementation(async () => ({ rows: [{ api_provider: state.provider }] })); state.request.mockReset().mockResolvedValue([{ containerNumber: 'AXIU1634881', events: { data: [{ operation: 'Discharged' }] } }]); process.env.FESCO_API_TOKEN = 'test-token'; });
async function call(query: object = { ferryId: '1', number: 'AXIU 1634881' }) {
  const res = { code: 0, data: null as any, setHeader() {}, status(code: number) { this.code = code; return this; }, json(data: unknown) { this.data = data; return this; } };
  await handler({ method: 'GET', headers: { 'x-login': 'user', 'x-password': 'pass' }, query } as any, res as any); return res;
}
it('normalizes the container and returns all cargo data without exposing credentials', async () => {
  const res = await call(); expect(res.code).toBe(200); expect(state.request).toHaveBeenCalledWith('AXIU1634881', 'test-token'); expect(res.data.data[0].events.data[0].operation).toBe('Discharged'); expect(JSON.stringify(res.data)).not.toContain('test-token');
});
it('blocks anonymous access before contacting FESCO', async () => { state.authorized = false; expect((await call()).code).toBe(401); expect(state.request).not.toHaveBeenCalled(); });
it('requires a configured provider and server token', async () => { state.provider = 'other'; expect((await call()).code).toBe(409); state.provider = 'FESCO'; delete process.env.FESCO_API_TOKEN; expect((await call()).code).toBe(503); expect(state.request).not.toHaveBeenCalled(); });
it('rejects malformed numbers and ids', async () => { for (const query of [{ number: 'x&token=bad', ferryId: 1 }, { number: 'AXIU1634881', ferryId: '1.5' }]) expect((await call(query)).code).toBe(400); expect(state.request).not.toHaveBeenCalled(); });
it('handles upstream errors without leaking database internals', async () => { state.query.mockRejectedValueOnce(new Error('password secret')); const res = await call(); expect(res.code).toBe(502); expect(res.data.error).not.toContain('secret'); });
