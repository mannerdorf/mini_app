import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../api/_db.js', () => ({ getPool: () => mock }));
import { isRateLimited, getClientIp } from './rateLimit.js';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE TABLE request_rate_limits(bucket_key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL)');
  mock.query.mockImplementation((sql, params) => db.query(sql,params));
});
afterAll(async () => { await db.close(); vi.unstubAllEnvs(); });
it('shares one atomic budget across concurrent requests and rolls over', async () => {
  const results = await Promise.all(Array.from({length: 8}, () => isRateLimited('login','ip',3)));
  expect(results.filter(v => !v)).toHaveLength(3);
  await db.exec("UPDATE request_rate_limits SET expires_at=now()-interval '1 second'");
  expect(await isRateLimited('login','ip',3)).toBe(false);
});
it('fails closed when storage fails', async () => {
  mock.query.mockRejectedValueOnce(new Error('unavailable'));
  expect(await isRateLimited('login','ip',3)).toBe(true);
});
it('only trusts forwarding from configured peers', () => {
  vi.stubEnv('TRUSTED_PROXY_IPS','127.0.0.1');
  expect(getClientIp({socket:{remoteAddress:'8.8.8.8'},headers:{'x-forwarded-for':'1.1.1.1'}})).toBe('8.8.8.8');
  expect(getClientIp({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'9.9.9.9, 8.8.8.8'}})).toBe('8.8.8.8');
});
