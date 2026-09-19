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
    CREATE TABLE cache_perevozki(id int PRIMARY KEY,data jsonb); CREATE TABLE cache_perevozki_rows(payload jsonb); CREATE TABLE document_cache_normalized_state(kind text PRIMARY KEY,row_count bigint); CREATE TABLE cache_orders(id int PRIMARY KEY,data jsonb,fetched_at timestamptz);`);
  const migration=readFileSync(new URL('../../migrations/114_pickup_1c_integration.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
},30000);
afterAll(()=>db.close());
beforeEach(async()=>{await db.exec('TRUNCATE pickup_jobs,cache_perevozki,cache_perevozki_rows,document_cache_normalized_state,cache_orders CASCADE');vi.mocked(deliverySetter).mockReset();vi.mocked(deliverySetter).mockResolvedValue({ok:true});});
describe('pickup billing and durable outbox',()=>{
  it('restores a ten-row batch after database restart without retrying transmitted or uncertain writes', async()=>{
    const transports=[];
    for(let n=1;n<=10;n++) {
      const pickup=`ZB-BATCH-${n}`, number=String(n).padStart(6,'0');
      await db.query("INSERT INTO pickup_jobs(id,job_number,city,date,status,data) VALUES($1,$2,'moscow','2026-09-17','deposited',$3)",[
        randomUUID(),pickup,JSON.stringify({customerInn:'7701234567',customerName:'Заказчик',issueCustomerBill:true,customerBillMode:'auto',zayavkaNumber:number,mkadKm:0,cargoNumber:''})]);
      transports.push({...cargo(),Number:number,НомерПикапа:pickup});
    }
    await db.query('INSERT INTO cache_perevozki VALUES(1,$1)',[JSON.stringify(transports)]);
    vi.mocked(deliverySetter).mockImplementation(async(_method,payload:any)=>payload.Номер==='000010'
      ? {ok:false,uncertain:true,error:'Response lost'}
      : payload.Номер==='000009' ? {ok:false,error:'Rejected'} : {ok:true});
    const rows=(await journal()).rows;
    expect(rows).toHaveLength(10);
    for(const row of rows) await billingSend(pool,'dispatcher',{confirmed:true,id:row.jobId,version:row.version});
    expect(deliverySetter).toHaveBeenCalledTimes(10);
    const dump=await db.dumpDataDir();
    await db.close();
    db=new PGlite({loadDataDir:dump});
    const restored=(await journal()).rows;
    expect(restored.filter(r=>r.status==='transmitted')).toHaveLength(8);
    expect(restored.filter(r=>r.status==='manual')).toHaveLength(1);
    expect(restored.filter(r=>r.status==='uncertain')).toHaveLength(1);
    for(const row of restored.filter(r=>r.status!=='manual')) {
      await expect(billingSend(pool,'dispatcher',{confirmed:true,id:row.jobId,version:row.version})).rejects.toThrow();
    }
    expect(deliverySetter).toHaveBeenCalledTimes(10);
  },30000);
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


describe('billing transport joined by order number',()=>{
  it.each([false,true])('loads metrics by ZayavkaNumber before pickup sync (normalized=%s)',async(normalized)=>{
    await seed();
    const row={...cargo(),НомерПикапа:'',ZayavkaNumber:'000123'};
    if(normalized){
      await db.query("INSERT INTO document_cache_normalized_state VALUES('perevozki',1)");
      await db.query('INSERT INTO cache_perevozki_rows VALUES($1)',[JSON.stringify(row)]);
      await db.query('DELETE FROM cache_perevozki');
    } else await db.query('UPDATE cache_perevozki SET data=$1',[JSON.stringify([row])]);
    const bill=(await journal()).rows[0];
    expect(bill.error).toBeNull();
    expect(bill).toMatchObject({orderNumber:'000123',amount:540,source:{transportNumber:'000001',orderNumber:'000123',places:2,weight:37,volume:0.27,chargeableWeight:54}});
    expect(deliverySetter).not.toHaveBeenCalled();
    await billingEdit(pool,'dispatcher',{id,version:bill.version,amount:600,action:'billing_save'});
    const saved=(await journal()).rows[0];
    await billingSend(pool,'dispatcher',{confirmed:true,id,version:saved.version});
    expect(deliverySetter).toHaveBeenCalledWith('SetPickupCost',{Номер:'000001',СтоимостьПикапа:600});
  });
  it('shows the job order number even when no transportation is found',async()=>{
    await seed();await db.query("UPDATE cache_perevozki SET data='[]'");
    expect((await journal()).rows[0]).toMatchObject({orderNumber:'000123',error:expect.stringContaining('не найдена')});
  });
  it('rejects foreign customers, multiple transports and conflicting identifiers',()=>{
    const job:any={job_number:'ZB-001',data:{customerInn:'7701234567',zayavkaNumber:'000123',cargoNumber:''}};
    const row={...cargo(),НомерПикапа:'',ZayavkaNumber:'000123'};
    expect(()=>matchBillingTransport(job,[{...row,INN:'other'}])).toThrow('не найдена');
    expect(()=>matchBillingTransport(job,[row,{...row,Number:'000002'}])).toThrow('несколько');
    expect(()=>matchBillingTransport(job,[{...row,НомерПикапа:'ZB-OTHER'}])).toThrow('другим забором');
    expect(()=>matchBillingTransport(job,[{...row,НомерПикапа:'ZB-001',ZayavkaNumber:'other'}])).toThrow('Номер заявки');
    expect(transportNumber(matchBillingTransport({...job,data:{...job.data,zayavkaNumber:'123'}},[row]))).toBe('000001');
    expect(transportNumber(matchBillingTransport({...job,data:{...job.data,zayavkaNumber:'00017957'}},[{...row,Number:'000142499',ZayavkaNumber:'000017957'}]))).toBe('000142499');
  });
  it('expands normalized candidates across customers to reject globally ambiguous transport numbers',async()=>{
    await seed();await db.query("INSERT INTO document_cache_normalized_state VALUES('perevozki',2)");
    for(const row of [{...cargo(),НомерПикапа:'',ZayavkaNumber:'000123'},{...cargo(),INN:'other',НомерПикапа:'',ZayavkaNumber:'different'}])
      await db.query('INSERT INTO cache_perevozki_rows VALUES($1)',[JSON.stringify(row)]);
    expect((await journal()).rows[0].error).toContain('неоднозначен');
    expect(deliverySetter).not.toHaveBeenCalled();
  });
});
