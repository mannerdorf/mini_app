import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { assertPickupOrderAvailable } from './orderAssignment';

const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const db = new PGlite();
const input = { id, number: '18614', customerInn: '100', jobNumber: 'ZB-NEW' };
const check = (overrides = {}) => assertPickupOrderAvailable(db as any, { ...input, ...overrides });
beforeAll(async () => {
  await db.exec('CREATE TABLE pickup_jobs(id uuid,job_number text,data jsonb); CREATE TABLE cache_orders(id int,data jsonb)');
});
beforeEach(async () => { await db.exec('TRUNCATE pickup_jobs,cache_orders'); });
afterAll(async () => { await db.close(); });
async function job(overrides = {}, jobId = other, number: string | null = 'ZB-OLD') {
  await db.query('INSERT INTO pickup_jobs VALUES($1,$2,$3)', [jobId, number, {customerInn:'100',zayavkaNumber:'000018614',...overrides}]);
}
async function cache(pickup = 'ZB-OLD') {
  await db.query('INSERT INTO cache_orders VALUES(1,$1)', [[{Номер:'000018614',НомерЗаявкиКлиента:'CLIENT-7',ЗаказчикИНН:'100',НомерПикапа:pickup}]]);
}
it('rejects the same numeric order with different padding and whitespace', async () => {
  await job({zayavkaNumber:' 000018614 '});
  await expect(check()).rejects.toMatchObject({status:409});
});
it('does not reject saving the same job or another customer or last-mile delivery', async () => {
  await job({}, id); await expect(check()).resolves.toBe('18614');
  await job({customerInn:'200'}); await expect(check()).resolves.toBe('18614');
  await job({serviceKind:'last_mile'}); await expect(check()).resolves.toBe('18614');
  await job(); await expect(check({serviceKind:'last_mile'})).resolves.toBe('18614');
});
it('rejects assignments recorded in 1C and resolves customer order aliases', async () => {
  await cache();
  await expect(check({number:'CLIENT-7'})).rejects.toThrow('ZB-OLD');
  await expect(check({number:'CLIENT-7',jobNumber:'ZB-OLD'})).resolves.toBe('000018614');
});
it('checks the canonical order when the driver supplies a customer alias', async () => {
  await cache(''); await job();
  await expect(check({number:'CLIENT-7'})).rejects.toThrow('ZB-OLD');
});
it('rejects historical jobs without a pickup number', async () => {
  await job({}, other, null);
  await expect(check()).rejects.toMatchObject({status:409});
});
