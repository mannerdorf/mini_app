import { beforeAll,afterAll,it,expect,vi } from 'vitest';
import { refreshDatedKindForWindow } from './documentCacheRefreshCore';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { diagnoseOrders } from './ordersDiagnostics';
import { safeOrdersSyncError,writeOrdersSyncTrace,readOrdersSyncTrace } from './ordersSyncDiagnostics';
let db:PGlite;
const pool={query:(sql:string,args?:unknown[])=>db.query(sql,args)} as unknown as Pool;
beforeAll(async()=>{
  db=new PGlite();
  const migration=readFileSync(new URL('../migrations/115_orders_sync_diagnostics.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec('CREATE TABLE cache_orders(id int PRIMARY KEY,data jsonb,fetched_at timestamptz)');
},30000);
afterAll(()=>db.close());
it('records stages, preserves last stage on failure and ignores an older run',async()=>{
  await writeOrdersSyncTrace(pool,'first',{status:'running',stage:'request_1c'},true);
  await writeOrdersSyncTrace(pool,'second',{status:'running',stage:'response_1c'},true);
  await writeOrdersSyncTrace(pool,'first',{status:'success'});
  await writeOrdersSyncTrace(pool,'second',{status:'error',error:'Ошибка ответа'});
  const trace=await readOrdersSyncTrace(pool);
  expect(trace.request_id).toBe('second');
  expect(trace.detail).toMatchObject({status:'error',stage:'response_1c'});
});
it('shows where authorized rows disappear without leaking other customers or payloads',async()=>{
  const rows=[
    {ЗаказчикИНН:'1',ЗаказчикНаименование:'Альфа',Дата:'2026-09-01'},
    {ЗаказчикИНН:'1',ЗаказчикНаименование:'Альфа',Дата:'2025-01-01'},
    {ЗаказчикИНН:'1',ЗаказчикНаименование:'Бета',Дата:'2026-09-01'},
    {ЗаказчикИНН:'2',ЗаказчикНаименование:'PRIVATE_FOREIGN',Дата:'2026-09-01'},
  ];
  await db.query('INSERT INTO cache_orders VALUES(1,$1,now())',[JSON.stringify(rows)]);
  const result=await diagnoseOrders(pool,{matchesScope:r=>r.ЗаказчикИНН==='1',dateOf:r=>r.Дата,dateFrom:'2026-09-01',dateTo:'2026-09-30',customerName:'Альфа',requestId:'test'});
  expect(result.counts).toEqual({authorized:3,afterName:2,afterDates:1,withoutDate:0});
  expect(JSON.stringify(result)).not.toContain('PRIVATE_FOREIGN');
  expect(JSON.stringify(result)).not.toContain('ЗаказчикИНН');
});
it('distinguishes an empty snapshot from absent data and unavailable diagnostics',async()=>{
  await db.query("UPDATE cache_orders SET data='[]'");
  const opts={matchesScope:()=>true,dateOf:()=>'',dateFrom:'2026-09-01',dateTo:'2026-09-30',customerName:'',requestId:'test'};
  expect((await diagnoseOrders(pool,opts)).database.state).toBe('ready');
  await db.exec('DELETE FROM cache_orders');
  expect((await diagnoseOrders(pool,opts)).database.state).toBe('missing_snapshot');
  const broken={query:async()=>{throw new Error('secret connection URL')}} as unknown as Pool;
  const unavailable=await diagnoseOrders(broken,opts);
  expect(unavailable.database.state).toBe('unavailable');
  expect(unavailable.cron.available).toBe(false);
  expect(JSON.stringify(unavailable)).not.toContain('secret');
});
it('does not expose upstream bodies, credentials or SQL errors',()=>{
  expect(safeOrdersSyncError(new Error('HTTP 401: secret password'))).toBe('1С вернула HTTP 401');
  expect(safeOrdersSyncError({name:'TimeoutError'})).toContain('не ответила');
  expect(safeOrdersSyncError(new Error('Invalid JSON: PRIVATE'))).not.toContain('PRIVATE');
  expect(safeOrdersSyncError(new Error('password=PRIVATE'))).not.toContain('PRIVATE');
});

it('traces a successful GetZayavki response all the way to the cache, and retains data after malformed response',async()=>{
  await db.query("INSERT INTO cache_orders VALUES(1,'[]',now()) ON CONFLICT(id) DO UPDATE SET data='[]'");
  const order={Номер:'000123',ЗаказчикИНН:'1',Ссылка:'test-ref',Дата:'2026-09-01'};
  const trace=vi.fn(async()=>{});
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify([order]),{status:200}));
  vi.stubGlobal('fetch',fetch);
  try {
    const result=await refreshDatedKindForWindow(pool,'login','password','orders','2026-09-01','2026-09-30','chunk',{webPush:false,trace});
    expect(result.chunkCountRows).toBe(1);
    expect(trace.mock.calls.map((args:any)=>args[0].stage)).toEqual(['request_1c','response_1c','write_database','database_saved']);
    fetch.mockResolvedValue(new Response(JSON.stringify({unexpected:[]}),{status:200}));
    await expect(refreshDatedKindForWindow(pool,'login','password','orders','2026-09-01','2026-09-30','chunk',{trace})).rejects.toThrow('неверный формат');
    expect((await db.query('SELECT data FROM cache_orders WHERE id=1')).rows[0].data).toEqual([order]);
  } finally {vi.unstubAllGlobals();}
});
