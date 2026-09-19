import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
vi.mock('./deliveryService.js',()=>({deliverySetter:vi.fn()}));
vi.mock('./customerQuote.js',()=>({buildPickupCustomerQuote:vi.fn(async(_pool,input)=>({totalRub:input.chargeableWeightKg*10}))}));
import {deliverySetter} from './deliveryService.js';
import {billingJournal,billingEdit,billingSend,matchBillingTransport,transportMetrics,transportNumber} from './billing.js';
import {resolveOrderNumber,syncPickupNumbers} from './numberSync.js';
let db:PGlite;
const pool:any={query:(s:string,p?:any[])=>db.query(s,p),connect:async()=>({query:(s:string,p?:any[])=>db.query(s,p),release:()=>{}})};
const cargo=()=>({Number:'000001',НомерПикапа:'ZB-001',INN:'7701234567',Mest:2,W:37,Value:0.27,PW:54});
let id:string;
async function seed(mode='auto') {
  id=randomUUID();
  await db.query("INSERT INTO pickup_jobs(id,job_number,city,date,status,data) VALUES($1,'ZB-001','moscow','2026-09-17','deposited',$2)",[id,JSON.stringify({customerInn:'7701234567',customerName:'Заказчик',issueCustomerBill:true,customerBillMode:mode,zayavkaNumber:'000123',mkadKm:0,cargoNumber:''})]);
  await db.query('INSERT INTO cache_perevozki VALUES(1,$1)',[JSON.stringify([cargo()])]);
}
const journal=()=>billingJournal(pool,'moscow','2026-09-17','dispatcher');
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE TABLE pickup_jobs(id uuid PRIMARY KEY,job_number text,city text,date date,status text,data jsonb);
    CREATE TABLE cache_perevozki(id int PRIMARY KEY,data jsonb); CREATE TABLE document_cache_normalized_state(kind text PRIMARY KEY,row_count bigint); CREATE TABLE cache_orders(id int PRIMARY KEY,data jsonb,fetched_at timestamptz);`);
  const migration=readFileSync(new URL('../../migrations/114_pickup_1c_integration.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
},30000);
afterAll(()=>db.close());
beforeEach(async()=>{await db.exec('TRUNCATE pickup_jobs,cache_perevozki,cache_orders CASCADE');vi.mocked(deliverySetter).mockReset();vi.mocked(deliverySetter).mockResolvedValue({ok:true});});
describe('pickup billing and durable outbox',()=>{
  it('uses transportation PW and metrics, manual rows start empty',async()=>{
    await seed();const row=(await journal()).rows[0];
    expect(row.amount).toBe(540);expect(row.source).toMatchObject({places:2,weight:37,chargeableWeight:54});
    await db.query("UPDATE pickup_jobs SET data=jsonb_set(data,'{customerBillMode}','\"manual\"') WHERE id=$1",[id]);
    expect((await journal()).rows[0].amount).toBeNull();
  });
  it('retains manually edited amount and rejects stale versions',async()=>{
    await seed('manual');const row=(await journal()).rows[0];
    await billingEdit(pool,'dispatcher',{id,version:row.version,amount:0,action:'billing_save'});
    await expect(billingEdit(pool,'dispatcher',{id,version:row.version,amount:100,action:'billing_save'})).rejects.toThrow('изменилась');
    expect((await journal()).rows[0].amount).toBe(0);
  });
  it('passes raw leading zeros to 1C once and records transmitted, not issued',async()=>{
    await seed();const row=(await journal()).rows[0];
    expect(await billingSend(pool,'dispatcher',{confirmed:true,id,version:row.version})).toMatchObject({ok:true,status:'transmitted'});
    expect(deliverySetter).toHaveBeenCalledWith('SetPickupCost',{Номер:'000001',СтоимостьПикапа:540});
    await expect(billingSend(pool,'dispatcher',{confirmed:true,id,version:row.version})).rejects.toThrow();
    expect(deliverySetter).toHaveBeenCalledTimes(1);
    const next=(await journal()).rows[0];
    await expect(billingEdit(pool,'dispatcher',{id,version:next.version,action:'billing_mark_issued'})).rejects.toThrow('недоступно');
    expect((await journal()).rows[0].status).toBe('transmitted');
  });
  it('blocks sending if the cargo metrics changed after dispatcher review',async()=>{
    await seed();const row=(await journal()).rows[0];
    await db.query('UPDATE cache_perevozki SET data=$1',[JSON.stringify([{...cargo(),PW:100}])]);
    await expect(billingSend(pool,'dispatcher',{confirmed:true,id,version:row.version})).rejects.toThrow('изменились');
    expect(deliverySetter).not.toHaveBeenCalled();
  });
  it('keeps a failed row for manual issuance and does not retry uncertain writes',async()=>{
    await seed();let row=(await journal()).rows[0];
    vi.mocked(deliverySetter).mockResolvedValue({ok:false,uncertain:true,error:'timeout'});
    expect(await billingSend(pool,'dispatcher',{confirmed:true,id,version:row.version})).toMatchObject({status:'uncertain'});
    row=(await journal()).rows[0];await expect(billingSend(pool,'dispatcher',{confirmed:true,id,version:row.version})).rejects.toThrow();
    expect(deliverySetter).toHaveBeenCalledTimes(1);
  });
  it('queues completion atomically, requeues corrected order without duplicate rows',async()=>{
    await seed();let rows=(await db.query('SELECT * FROM pickup_number_sync')).rows;
    expect(rows[0]).toMatchObject({order_number:'000123',pickup_number:'ZB-001',state:'pending',generation:1});
    await db.query("UPDATE pickup_number_sync SET state='synced'");
    await db.query("UPDATE pickup_jobs SET data=jsonb_set(data,'{zayavkaNumber}','\"000124\"') WHERE id=$1",[id]);
    rows=(await db.query('SELECT * FROM pickup_number_sync')).rows;
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({order_number:'000124',state:'pending',generation:2});
    await db.exec('BEGIN');await db.query("UPDATE pickup_jobs SET data=jsonb_set(data,'{zayavkaNumber}','\"000125\"') WHERE id=$1",[id]);await db.exec('ROLLBACK');
    expect((await db.query('SELECT * FROM pickup_number_sync')).rows[0].order_number).toBe('000124');
  });
  it('does not join another customer or an ambiguous document number',()=>{
    const job:any={job_number:'ZB-001',data:{customerInn:'7701234567',cargoNumber:''}};
    expect(()=>matchBillingTransport(job,[{...cargo(),INN:'other'}])).toThrow('не найдена');
    expect(()=>matchBillingTransport(job,[cargo(),{...cargo(),INN:'other'}])).toThrow('неоднозначен');
    expect(transportMetrics({W:'37,5',Value:'',PW:NaN})).toMatchObject({weight:37.5,volume:null,chargeableWeight:null});
  });
  it('finds the transport by the pickup request number and copies weight, volume and chargeable weight',()=>{
    const job:any={job_number:'ZB-000171',data:{customerInn:'7701234567',zayavkaNumber:'000017957',cargoNumber:''}};
    const row=matchBillingTransport(job,[{Number:'142499',Order:'17957',INN:'7701234567',Mest:5,W:69.5,Value:0.73,PW:145.4}]);
    expect(transportNumber(row)).toBe('142499');
    expect(transportMetrics(row)).toEqual({places:5,weight:69.5,volume:0.73,chargeableWeight:145.4});
  });
  it('resolves order/client number only within customer scope and rejects OR collisions',()=>{
    const order={Номер:'000123',НомерЗаявкиКлиента:'CLIENT-1',ЗаказчикИНН:'7701234567'};
    const input={order_number:'CLIENT-1',customer_inn:'7701234567'};
    expect(resolveOrderNumber([order],input)).toBe('000123');
    expect(()=>resolveOrderNumber([order],{...input,customer_inn:'other'})).toThrow();
    expect(()=>resolveOrderNumber([order,{Номер:'2',НомерЗаявкиКлиента:'000123',ЗаказчикИНН:'other'}],input)).toThrow('неоднозначен');
  });
});

it('cron sends a queued pickup number and confirms only the claimed generation',async()=>{
  await seed();
  await db.query('INSERT INTO cache_orders VALUES(1,$1,now())',[JSON.stringify([{Номер:'000123',ЗаказчикИНН:'7701234567'}])]);
  expect(await syncPickupNumbers(pool)).toEqual({synced:1,failed:0});
  expect(deliverySetter).toHaveBeenCalledWith('SetPickupNumber',{Номер:'000123',НомерПикапа:'ZB-001'});
  expect((await db.query('SELECT state,attempts FROM pickup_number_sync')).rows[0]).toMatchObject({state:'synced',attempts:1});
  await syncPickupNumbers(pool);
  expect(deliverySetter).toHaveBeenCalledTimes(1);
});
it('cron retains a failed job with delayed retry instead of losing it',async()=>{
  await seed();
  await db.query('INSERT INTO cache_orders VALUES(1,$1,now())',[JSON.stringify([{Номер:'000123',ЗаказчикИНН:'7701234567'}])]);
  vi.mocked(deliverySetter).mockResolvedValue({ok:false,error:'temporary failure'});
  expect(await syncPickupNumbers(pool)).toEqual({synced:0,failed:1});
  expect((await db.query('SELECT state,last_error,next_attempt_at>now() AS delayed FROM pickup_number_sync')).rows[0]).toEqual({state:'error',last_error:'temporary failure',delayed:true});
  await syncPickupNumbers(pool);expect(deliverySetter).toHaveBeenCalledTimes(1);
});

it('requires dispatcher confirmation before transmitting cost',async()=>{
  await seed();const row=(await journal()).rows[0];
  await expect(billingSend(pool,'dispatcher',{id,version:row.version})).rejects.toThrow('Подтвердите');
  expect(deliverySetter).not.toHaveBeenCalled();
});
it('allows manual issuance confirmation following a rejected transfer',async()=>{
  await seed();const row=(await journal()).rows[0];
  vi.mocked(deliverySetter).mockResolvedValue({ok:false,error:'не найдена перевозка'});
  expect(await billingSend(pool,'dispatcher',{confirmed:true,id,version:row.version})).toMatchObject({status:'manual'});
  const failed=(await journal()).rows[0];
  await billingEdit(pool,'dispatcher',{id,version:failed.version,action:'billing_mark_issued'});
  expect((await journal()).rows[0].status).toBe('issued');
});
