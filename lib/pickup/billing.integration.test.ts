import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
vi.mock('./deliveryService.js',()=>({deliverySetter:vi.fn()}));
vi.mock('./customerQuote.js',()=>({buildPickupCustomerQuote:vi.fn(async(_pool,input)=>({totalRub:input.chargeableWeightKg*10}))}));
import {deliverySetter} from './deliveryService.js';
import {billingMatchTransport,billingMatchInvoice,billingQuote,billingJournal,billingEdit,billingSend,resolvePickupTransportNumbers,matchBillingTransport,transportMetrics,transportNumber} from './billing.js';
import {processPickupAutoBilling} from './autoBilling.js';
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
  await db.exec(`CREATE TABLE pickup_jobs(id uuid PRIMARY KEY,job_number text,city text,date date,status text,data jsonb,version integer default 1,updated_at timestamptz default now());
    CREATE TABLE pickup_events(id uuid,job_id uuid,actor text,action text,data jsonb);
    CREATE TABLE cache_invoices_rows(doc_number text,doc_date date,customer_inn text,payload jsonb); CREATE TABLE cache_perevozki(id int PRIMARY KEY,data jsonb); CREATE TABLE cache_perevozki_rows(payload jsonb); CREATE TABLE document_cache_normalized_state(kind text PRIMARY KEY,row_count bigint); CREATE TABLE cache_orders(id int PRIMARY KEY,data jsonb,fetched_at timestamptz);`);
  const migration=readFileSync(new URL('../../migrations/114_pickup_1c_integration.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec(readFileSync(new URL('../../migrations/119_pickup_auto_billing.sql',import.meta.url),'utf8'));
},30000);
afterAll(()=>db.close());
beforeEach(async()=>{await db.exec('TRUNCATE cache_invoices_rows,pickup_jobs,cache_perevozki,cache_perevozki_rows,document_cache_normalized_state,cache_orders CASCADE');vi.mocked(deliverySetter).mockReset();vi.mocked(deliverySetter).mockResolvedValue({ok:true});});
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

describe('automatic pickup billing',()=>{
  it('sends calculated cost after eligible handoff and never sends twice',async()=>{
    await seed();
    expect(await processPickupAutoBilling(pool)).toMatchObject({processed:1,status:'transmitted'});
    expect(deliverySetter).toHaveBeenCalledWith('SetPickupCost',{Номер:'000001',СтоимостьПикапа:540});
    expect(await processPickupAutoBilling(pool)).toEqual({processed:0});
    expect(deliverySetter).toHaveBeenCalledTimes(1);
  });
  it('waits for cargo, then sends when cargo becomes available',async()=>{
    await seed();await db.query('UPDATE cache_perevozki SET data=$1',[JSON.stringify([])]);
    expect(await processPickupAutoBilling(pool)).toMatchObject({waiting:1});
    expect(deliverySetter).not.toHaveBeenCalled();
    await db.query('UPDATE cache_perevozki SET data=$1',[JSON.stringify([cargo()])]);
    await db.query('UPDATE pickup_auto_billing_queue SET next_at=now()');
    expect(await processPickupAutoBilling(pool)).toMatchObject({status:'transmitted'});
  });
  it('does not retry an uncertain write',async()=>{
    await seed();vi.mocked(deliverySetter).mockResolvedValue({ok:false,uncertain:true,error:'timeout'});
    expect(await processPickupAutoBilling(pool)).toMatchObject({status:'uncertain'});
    await db.query('UPDATE pickup_auto_billing_queue SET next_at=now()');
    await processPickupAutoBilling(pool);
    expect(deliverySetter).toHaveBeenCalledTimes(1);
  });
  it('does not enqueue manual jobs, but enqueues a subsequent switch to automatic',async()=>{
    await seed('manual');
    expect(await processPickupAutoBilling(pool)).toEqual({processed:0});
    await db.query("UPDATE pickup_jobs SET data=jsonb_set(data,'{customerBillMode}','\"auto\"') WHERE id=$1",[id]);
    expect(await processPickupAutoBilling(pool)).toMatchObject({status:'transmitted'});
  });
  it('does not backfill old deposited jobs when migration is reapplied',async()=>{
    await seed();await db.exec('DELETE FROM pickup_auto_billing_queue');
    await db.exec(readFileSync(new URL('../../migrations/119_pickup_auto_billing.sql',import.meta.url),'utf8'));
    expect(await processPickupAutoBilling(pool)).toEqual({processed:0});
  });
  it('waits for the request number before enqueueing',async()=>{
    await seed();await db.exec('DELETE FROM pickup_auto_billing_queue');
    await db.query("UPDATE pickup_jobs SET data=jsonb_set(data,'{zayavkaNumber}','\"\"') WHERE id=$1",[id]);
    expect(await processPickupAutoBilling(pool)).toEqual({processed:0});
    await db.query("UPDATE pickup_jobs SET data=jsonb_set(data,'{zayavkaNumber}','\"000123\"') WHERE id=$1",[id]);
    expect(await processPickupAutoBilling(pool)).toMatchObject({status:'transmitted'});
  });
  it('does not automatically transmit a dispatcher-edited amount',async()=>{
    await seed();const row=(await journal()).rows[0];
    await billingEdit(pool,'dispatcher',{id,version:row.version,amount:777,action:'billing_save'});
    expect(await processPickupAutoBilling(pool)).toMatchObject({waiting:1});
    expect(deliverySetter).not.toHaveBeenCalled();
  });
  it('does not send if automatic mode was disabled while waiting',async()=>{
    await seed();await db.query("UPDATE pickup_jobs SET data=jsonb_set(data,'{customerBillMode}','\"manual\"') WHERE id=$1",[id]);
    expect(await processPickupAutoBilling(pool)).toMatchObject({waiting:1});
    expect(deliverySetter).not.toHaveBeenCalled();
  });
});

it('resolves the card transport by order without enabling billing or changing job data', async()=>{
  await seed();
  await db.query('UPDATE cache_perevozki SET data=$1', [JSON.stringify([{...cargo(), НомерПикапа:'', ZayavkaNumber:'123'}])]);
  const job:any=(await db.query('SELECT * FROM pickup_jobs WHERE id=$1',[id])).rows[0];
  job.data.issueCustomerBill=false;
  await resolvePickupTransportNumbers(pool,[job]);
  expect(job.linked_transport_number).toBe('000001');
  expect(job.data.cargoNumber).toBe('');
  job.data.customerInn='other';
  delete job.linked_transport_number;
  await resolvePickupTransportNumbers(pool,[job]);
  expect(job.linked_transport_number).toBeUndefined();
});

it('rounds unissued calculator amounts, including previously rejected amounts, before sending', async()=>{
  await seed();
  const initial=(await journal()).rows[0];
  await db.query("UPDATE pickup_billing SET amount=2448.44,status='manual' WHERE job_id=$1",[id]);
  expect((await journal()).rows[0].amount).toBe(2448);
  await db.query("UPDATE pickup_billing SET status='not_issued',amount_manual=true WHERE job_id=$1",[id]);
  const row=(await journal()).rows[0];
  const saved=await billingEdit(pool,'dispatcher',{action:'billing_save',id,version:row.version,amount:2448.5});
  await billingSend(pool,'dispatcher',{id,version:saved.version,confirmed:true});
  expect(deliverySetter).toHaveBeenCalledWith('SetPickupCost',{Номер:initial.source.transportNumber,СтоимостьПикапа:2449});
  await db.query("UPDATE pickup_billing SET amount=2448.44,status='transmitted' WHERE job_id=$1",[id]);
  expect((await journal()).rows[0].amount).toBe(2448.44);
});
it('retries a rejected transfer only explicitly and rejects stale or completed retries',async()=>{
  await seed();let row=(await journal()).rows[0];
  vi.mocked(deliverySetter).mockResolvedValueOnce({ok:false,error:'401'});
  await billingSend(pool,'dispatcher',{id,version:row.version,confirmed:true});
  row=(await journal()).rows[0];
  await expect(billingSend(pool,'dispatcher',{id,version:row.version,confirmed:true})).rejects.toThrow();
  expect(await billingSend(pool,'dispatcher',{id,version:row.version,confirmed:true,retry:true})).toMatchObject({ok:true});
  expect(deliverySetter).toHaveBeenLastCalledWith('SetPickupCost',expect.any(Object),true);
  await expect(billingSend(pool,'dispatcher',{id,version:row.version,confirmed:true,retry:true})).rejects.toThrow();
  row=(await journal()).rows[0];
  await expect(billingSend(pool,'dispatcher',{id,version:row.version,confirmed:true,retry:true})).rejects.toThrow();
  expect(deliverySetter).toHaveBeenCalledTimes(2);
});

it('reads the pickup invoice service instead of the transport invoice without changing sent billing',async()=>{
  await seed();
  await processPickupAutoBilling(pool);
  const before=(await journal()).rows[0];
  expect(before.invoiceNumber).toBe('');
  await db.query('UPDATE cache_perevozki SET data=$1',[JSON.stringify([{...cargo(),BillNum:'000001529'}])]);
  expect((await journal()).rows[0].invoiceNumber).toBe('');
  await db.query('INSERT INTO cache_invoices_rows VALUES($1,$2,$3,$4)', ['000004062','2026-09-17','7701234567',JSON.stringify({List:[{Name:'Заборная логистика',Operation:'Заборная логистика, перевозка 000001 от 17.09.2026'}]})]);
  const after=(await journal()).rows[0];
  expect(after.invoiceNumber).toBe('000004062');
  expect(after.status).toBe('transmitted');
  expect(after.version).toBe(before.version);
  expect(deliverySetter).toHaveBeenCalledTimes(1);
});

it('includes both ends of the billing period and returns each job date',async()=>{
  await seed();
  for(const [number,date] of [['ZB-002','2026-09-18'],['ZB-003','2026-09-19']]) {
    await db.query("INSERT INTO pickup_jobs SELECT $1,$2,city,$3,status,data FROM pickup_jobs WHERE id=$4",[randomUUID(),number,date,id]);
  }
  const result=await billingJournal(pool,'moscow','2026-09-17','dispatcher',undefined,'2026-09-18');
  expect(result.rows.map(row=>[row.jobNumber,row.date])).toEqual([['ZB-002','2026-09-18'],['ZB-001','2026-09-17']]);
  expect((await journal()).rows).toHaveLength(1);
  await expect(billingJournal(pool,'moscow','2026-09-18','dispatcher',undefined,'2026-09-17')).rejects.toThrow();
});

it('calculates a manual billing draft without saving it or sending to 1C',async()=>{
 await seed('manual'); const {rows:[row]}=await journal();
 const result=await billingQuote(pool,{id,version:row.version});
 expect(result.amount).toBe(540);
 const stored=(await db.query('SELECT amount,status,amount_manual FROM pickup_billing WHERE job_id=$1',[id])).rows[0];
 expect(stored).toMatchObject({amount:null,status:'not_issued',amount_manual:false});
 expect(deliverySetter).not.toHaveBeenCalled();
 await expect(billingQuote(pool,{id,version:row.version-1})).rejects.toThrow('Данные изменились');
});

it('creates an invoice on explicit button request and restores the returned number before cache refresh',async()=>{
 await seed();const row=(await journal()).rows[0];
 vi.mocked(deliverySetter).mockResolvedValue({ok:true,invoiceNumber:'000004200',invoiceId:'invoice-uuid'});
 expect(await billingSend(pool,'dispatcher',{confirmed:true,createInvoice:true,id,version:row.version})).toMatchObject({status:'issued',invoiceNumber:'000004200'});
 expect(deliverySetter).toHaveBeenCalledWith('CreatePickupInvoice',{Номер:'000001',Сумма:540});
 expect((await journal()).rows[0]).toMatchObject({status:'issued',invoiceNumber:'000004200'});
 await expect(billingSend(pool,'dispatcher',{confirmed:true,createInvoice:true,id,version:row.version})).rejects.toThrow();
 expect(deliverySetter).toHaveBeenCalledTimes(1);
});
it('rejects zero invoice amounts before contacting 1C',async()=>{
 await seed('manual');let row=(await journal()).rows[0];
 await billingEdit(pool,'dispatcher',{id,version:row.version,amount:0,action:'billing_save'});
 row=(await journal()).rows[0];
 await expect(billingSend(pool,'dispatcher',{confirmed:true,createInvoice:true,id,version:row.version})).rejects.toThrow('больше нуля');
 expect(deliverySetter).not.toHaveBeenCalled();
});

it('automatically creates a pickup invoice after an explicit cost rejection and retains both results',async()=>{
 await seed();
 vi.mocked(deliverySetter).mockResolvedValueOnce({ok:false,rejectedByService:true,uncertain:false,error:'Счет уже выставлен на перевозку'})
   .mockResolvedValueOnce({ok:true,invoiceNumber:'000004201',invoiceId:'receipt-id'});
 expect(await processPickupAutoBilling(pool)).toMatchObject({processed:1,status:'issued'});
 expect(deliverySetter).toHaveBeenNthCalledWith(1,'SetPickupCost',{Номер:'000001',СтоимостьПикапа:540});
 expect(deliverySetter).toHaveBeenNthCalledWith(2,'CreatePickupInvoice',{Номер:'000001',Сумма:540});
 expect((await journal()).rows[0]).toMatchObject({status:'issued',invoiceNumber:'000004201'});
 const audit=await db.query("SELECT detail FROM pickup_billing_events WHERE job_id=$1 AND action='invoice_fallback_started'",[id]);
 expect(audit.rows[0].detail).toMatchObject({outcome:{error:'Счет уже выставлен на перевозку'}});
 await processPickupAutoBilling(pool);
 expect(deliverySetter).toHaveBeenCalledTimes(2);
});
it.each([
 {ok:false,uncertain:true,error:'timeout'},
 {ok:false,uncertain:false,error:'Unauthorized'},
 {ok:true},
])('does not start invoice fallback for an unconfirmed rejection or success: %j',async(outcome)=>{
 await seed();vi.mocked(deliverySetter).mockResolvedValue(outcome);
 await processPickupAutoBilling(pool);
 expect(deliverySetter).toHaveBeenCalledTimes(1);
});
it.each([
 {ok:false,uncertain:false,error:'счет уже выставлен'},
 {ok:false,uncertain:true,error:'timeout'},
])('stops after invoice fallback failure without looping: %j',async(outcome)=>{
 await seed();
 vi.mocked(deliverySetter).mockResolvedValueOnce({ok:false,rejectedByService:true,uncertain:false,error:'Запись запрещена'}).mockResolvedValueOnce(outcome);
 expect(await processPickupAutoBilling(pool)).toMatchObject({status:outcome.uncertain?'uncertain':'manual'});
 expect((await journal()).rows[0]).toMatchObject({last_error:outcome.error});
 await processPickupAutoBilling(pool);
 expect(deliverySetter).toHaveBeenCalledTimes(2);
});

it('lists all customer invoices regardless of service or transport and rejects another customer',async()=>{
 await seed();const row=(await journal()).rows[0];
 const insert=async(number:string,inn:string,name:string)=>db.query('INSERT INTO cache_invoices_rows VALUES($1,$2,$3,$4)',[number,'2026-09-18',inn,JSON.stringify({Customer:'Заказчик',Sum:1350,List:[{Name:name,Sum:1350}]})]);
 await insert('4200','7701234567','Услуги по забору груза. Перевозка № 000001');
 await insert('4201','7701234567','Услуги по перевозке груза. Перевозка № 000001');
 await insert('4202','7701234567','Услуги по забору груза. Перевозка № 999999');
 await insert('4203','other','Услуги по забору груза. Перевозка № 000001');
 const candidates=await billingMatchInvoice(pool,'dispatcher',{id,action:'billing_invoice_candidates'});
 expect(candidates.invoices?.map(i=>i.number)).toEqual(['4200','4201','4202']);
 expect(candidates.invoices?.[0]).toMatchObject({amount:1350,transportNumbers:['000001']});
 await expect(billingMatchInvoice(pool,'dispatcher',{id,action:'billing_match_invoice',version:row.version,invoiceNumber:'absent',invoiceDate:'2026-09-18'})).rejects.toThrow('не найден');
 await expect(billingMatchInvoice(pool,'dispatcher',{id,action:'billing_match_invoice',version:0,invoiceNumber:'4200',invoiceDate:'2026-09-18'})).rejects.toThrow('изменилась');
 await expect(billingMatchInvoice(pool,'dispatcher',{id,action:'billing_match_invoice',version:row.version,invoiceNumber:'4203',invoiceDate:'2026-09-18',invoiceInn:'other'})).rejects.toThrow('не найден');
 await billingMatchInvoice(pool,'dispatcher',{id,action:'billing_match_invoice',version:row.version,invoiceNumber:'4201',invoiceDate:'2026-09-18',invoiceInn:'7701234567'});
 expect((await journal()).rows[0]).toMatchObject({status:'issued',invoiceNumber:'4201',invoiceReferenceDate:'2026-09-18'});
 expect(deliverySetter).not.toHaveBeenCalled();
});

it('matches a transport from the same customer and replaces a placeholder order with its real order',async()=>{
 await seed();
 await db.query("UPDATE pickup_jobs SET data=data||$2::jsonb WHERE id=$1",[id,JSON.stringify({zayavkaNumber:'ZB-001'})]);
 await db.query('UPDATE cache_perevozki SET data=$1',[JSON.stringify([{...cargo(),НомерПикапа:'',ZayavkaNumber:'000999',Sender:'Отправитель'}])]);
 const candidates=await billingMatchTransport(pool,'dispatcher',{action:'billing_transport_candidates',id,search:'000001'});
 expect(candidates.transports).toHaveLength(1);
 await billingMatchTransport(pool,'dispatcher',{action:'billing_match_transport',id,jobVersion:candidates.version,transportNumber:'000001'});
 const updated=(await db.query('SELECT * FROM pickup_jobs WHERE id=$1',[id])).rows[0] as any;
 expect(updated.data).toMatchObject({cargoNumber:'000001',zayavkaNumber:'000999'});
 expect((await journal()).rows[0].source.transportNumber).toBe('000001');
 expect(deliverySetter).not.toHaveBeenCalled();
});
it('rejects a transport belonging to another customer and a stale selection',async()=>{
 await seed();
 await db.query('UPDATE cache_perevozki SET data=$1',[JSON.stringify([{...cargo(),INN:'other'}])]);
 await expect(billingMatchTransport(pool,'dispatcher',{action:'billing_match_transport',id,jobVersion:1,transportNumber:'000001'})).rejects.toThrow();
 await expect(billingMatchTransport(pool,'dispatcher',{action:'billing_match_transport',id,jobVersion:0,transportNumber:'000001'})).rejects.toThrow('изменился');
 expect((await db.query('SELECT data FROM pickup_jobs WHERE id=$1',[id])).rows[0].data).toMatchObject({cargoNumber:''});
});
