import { it, expect, vi } from 'vitest';
import { lockPickupMutation } from './mutationLocks';
const id = '00000000-0000-4000-8000-000000000001';
it('isolates independent route execution but serializes structural changes', async () => {
  const query = vi.fn().mockResolvedValue({rows:[]});
  await lockPickupMutation({query} as any,'driver',{action:'reorder',id,requestId:'a'});
  expect(query.mock.calls[0][0]).toContain('lock_shared');
  expect(query.mock.calls.at(-1)?.[1]).toEqual([`route:${id}`]);
  query.mockClear();
  await lockPickupMutation({query} as any,'dispatcher',{action:'assign',id,requestId:'b'});
  expect(query.mock.calls[0][0]).toBe('SELECT pg_advisory_xact_lock(104,1)');
});
it('serializes job operations by parent route and route starts by driver and vehicle', async () => {
  const query = vi.fn().mockImplementation(async (sql: string) => ({rows:sql.includes('SELECT route_id') ? [{route_id:'parent'}] : sql.includes('SELECT driver_id') ? [{driver_id:'d',vehicle_id:'v'}] : []}));
  await lockPickupMutation({query} as any,'driver',{action:'complete',id,requestId:'a'});
  expect(query.mock.calls.at(-1)?.[1]).toEqual(['route:parent']);
  query.mockClear();
  await lockPickupMutation({query} as any,'driver',{action:'start',id,requestId:'b'});
  expect(query.mock.calls.filter(c => c[0].includes('(106,')).map(c => c[1][0])).toEqual(['driver:d',`route:${id}`,'vehicle:v']);
});
it('serializes all order writers across routes before locking job rows', async () => {
  for (const action of ['save_job','deposit','set_job_order','set_job_status']) {
    const query = vi.fn().mockResolvedValue({rows:[]});
    await lockPickupMutation({query} as any,'actor',{action,id,requestId:action});
    const sql = query.mock.calls.map(c => c[0]);
    expect(sql[2]).toBe('SELECT pg_advisory_xact_lock(130,1)');
    const jobRead = sql.findIndex(s => s.includes('SELECT route_id'));
    if (jobRead >= 0) expect(jobRead).toBeGreaterThan(2);
    const routeLock = sql.findIndex(s => s.includes('(106,'));
    if (routeLock >= 0) expect(routeLock).toBeGreaterThan(2);
  }
});
