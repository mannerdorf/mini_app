import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ pool: null as any, authorized: true }));
vi.mock('./_db.js', () => ({ getPool: () => state.pool }));
vi.mock('../lib/adminAuth.js', () => ({ verifyAdminToken: () => state.authorized, getAdminTokenFromRequest: () => 'test' }));
vi.mock('./_lib/observability.js', () => ({ initRequestContext: () => ({ requestId: 'test' }), logError: () => {} }));
vi.mock('../lib/verifyRegisteredUser.js', () => ({ verifyRegisteredUser: async () => ({ login: 'driver@example.ru' }) }));
import handler from './ferries';
import assignmentHandler from './sendings-ferry';
let db: PGlite;
beforeEach(async () => {
  state.authorized = true; db = new PGlite();
  await db.exec(`CREATE TABLE ferries(id int PRIMARY KEY,name text,mmsi text,updated_at timestamptz DEFAULT now(),api_provider text);
    INSERT INTO ferries VALUES(1,'ALISA','273251360',now(),null);
    CREATE TABLE sendings_ferry(ferry_id int REFERENCES ferries(id),row_key text,login text,eta text);
    INSERT INTO sendings_ferry VALUES(1,'2708278','driver@example.ru',null);`);
  const migration = readFileSync(new URL('../migrations/128_ferries_active.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  state.pool = { query: (sql: string, params: unknown[] = []) => db.query(sql, params) };
});
afterEach(async () => { await db.close(); });
async function patch(body: unknown) {
  const res = { code: 0, data: null as any, status(code: number) { this.code = code; return this; }, json(data: unknown) { this.data = data; return this; } };
  await handler({ method: 'PATCH', body } as any, res as any); return res;
}
it('defaults existing ferries to enabled; disabling and re-enabling preserves assignments', async () => {
  expect((await db.query('SELECT active FROM ferries')).rows).toEqual([{ active: true }]);
  expect((await patch({ id: 1, active: false })).code).toBe(200);
  expect((await db.query('SELECT id FROM ferries WHERE active=true')).rows).toHaveLength(0);
  expect((await db.query('SELECT row_key FROM sendings_ferry')).rows).toEqual([{ row_key: '2708278' }]);
  expect((await patch({ id: 1, active: true })).code).toBe(200);
  expect((await db.query('SELECT id FROM ferries WHERE active=true')).rows).toEqual([{ id: 1 }]);
});
it('rejects unauthorized changes', async () => {
  state.authorized = false;
  expect((await patch({ id: 1, active: false })).code).toBe(401);
  expect((await db.query('SELECT active FROM ferries')).rows).toEqual([{ active: true }]);
});
it('rejects malformed toggle values without changing state', async () => {
  for (const body of [{ id: 1, active: 'false' }, { id: 0, active: false }, { id: 1.5, active: true }]) expect((await patch(body)).code).toBe(400);
  expect((await db.query('SELECT active FROM ferries')).rows).toEqual([{ active: true }]);
});
it('returns not found for an absent ferry', async () => {
  expect((await patch({ id: 999, active: false })).code).toBe(404);
});

it('rejects a new assignment to a disabled ferry while retaining its saved map information', async () => {
  await patch({ id: 1, active: false });
  const res = { code: 0, data: null as any, setHeader() {}, status(code: number) { this.code = code; return this; }, json(data: unknown) { this.data = data; return this; } };
  await assignmentHandler({ method: 'POST', body: { login: 'driver@example.ru', password: 'test', rowKey: 'new-sending', ferryId: 1 }, headers: {}, query: {} } as any, res as any);
  expect(res.code).toBe(409);
  await assignmentHandler({ method: 'GET', headers: { 'x-login': 'driver@example.ru', 'x-password': 'test' }, query: {} } as any, res as any);
  expect(res.code).toBe(200);
  expect(res.data.map['2708278']).toMatchObject({ ferry_id: 1, ferry_name: 'ALISA', mmsi: '273251360' });
  expect((await db.query('SELECT row_key FROM sendings_ferry')).rows).toEqual([{ row_key: '2708278' }]);
});

async function apiProviderMigration() {
  await db.exec(`ALTER TABLE ferries ALTER COLUMN id SET DEFAULT 2;
    ALTER TABLE ferries ADD CONSTRAINT ferries_mmsi_key UNIQUE (mmsi);
    ALTER TABLE ferries ADD COLUMN imo text;
    ALTER TABLE ferries ADD COLUMN vessel_type text;
    ALTER TABLE ferries ADD COLUMN operator text;
    UPDATE ferries SET name='FESCO NOVIK',mmsi='273329660' WHERE id=1;`);
  const migration = readFileSync(new URL('../migrations/129_ferries_api_provider.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
}
it('seeds FESCO for Novik and Navarin once, saves other providers and allows clearing', async () => {
  await apiProviderMigration();
  expect((await db.query('SELECT name,api_provider FROM ferries ORDER BY id')).rows).toEqual([
    { name: 'FESCO NOVIK', api_provider: 'FESCO' }, { name: 'FESCO NAVARIN', api_provider: 'FESCO' },
  ]);
  expect((await patch({ id: 1, api_provider: ' Other API ' })).code).toBe(200);
  expect((await db.query('SELECT api_provider,active FROM ferries WHERE id=1')).rows).toEqual([{ api_provider: 'Other API', active: true }]);
  expect((await patch({ id: 1, api_provider: '' })).code).toBe(200);
  expect((await db.query('SELECT api_provider FROM ferries WHERE id=1')).rows).toEqual([{ api_provider: null }]);
});
it('validates API provider edits and enforces admin access', async () => {
  await apiProviderMigration();
  expect((await patch({ id: 1, api_provider: 7 })).code).toBe(400);
  expect((await patch({ id: 1, api_provider: 'a'.repeat(81) })).code).toBe(400);
  expect((await patch({ id: 999, api_provider: 'FESCO' })).code).toBe(404);
  state.authorized = false;
  expect((await patch({ id: 1, api_provider: '' })).code).toBe(401);
});
