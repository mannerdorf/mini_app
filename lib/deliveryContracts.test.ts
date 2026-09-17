import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {refreshDatedKindForWindow,itemKey} from './documentCacheRefreshCore.js';
import {syncNormalizedWindow} from './documentCacheNormalized.js';
import {deliverySetter} from './pickup/deliveryService.js';
import {normalizeZayavkaUploadPayload,validateZayavkaForDelivery} from './post1cZayavkaUpload.js';
let db:PGlite;
const pool:any={query:(s:string,p?:any[])=>db.query(s,p),connect:async()=>({query:(s:string,p?:any[])=>db.query(s,p),release:()=>{}})};
beforeAll(async()=>{db=new PGlite();await db.exec('CREATE TABLE cache_orders(id int PRIMARY KEY,data jsonb,fetched_at timestamptz);');},30000);
afterAll(()=>db.close());afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('does not replace order cache on a malformed HTTP 200',async()=>{
  await db.query("INSERT INTO cache_orders VALUES(1,$1,now())",[JSON.stringify([{Номер:'old'}])]);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({unexpected:[]}))));
  await expect(refreshDatedKindForWindow(pool,'test','test','orders','2026-09-01','2026-09-17','chunk')).rejects.toThrow('неверный формат');
  expect((await db.query('SELECT data FROM cache_orders')).rows[0].data).toEqual([{Номер:'old'}]);
});
it('stores orders with pickup number and distinguishes the same number for different customers',async()=>{
  const one={Номер:'0001',Дата:'2026-09-17',Ссылка:'uuid1',ЗаказчикИНН:'111',НомерПикапа:'ZB-1'};
  const two={...one,Ссылка:'uuid2',ЗаказчикИНН:'222'};
  expect(itemKey('orders',one)).not.toBe(itemKey('orders',two));
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify([one,two]))));
  await refreshDatedKindForWindow(pool,'test','test','orders','2026-09-01','2026-09-17','chunk',{webPush:false});
  const data=(await db.query('SELECT data FROM cache_orders')).rows[0].data as any[];
  expect(data).toEqual(expect.arrayContaining([one,two]));
});
it('preserves the whole GetPerevozki payload, raw number and pickup link in normalized DB storage',async()=>{
  const payload={Number:'000001',DatePrih:'2026-09-17',INN:'7701234567',НомерПикапа:'ZB-001',НомерЗаявки:'000123',Mest:2,W:37,Value:0.27,PW:54,FutureField:{nested:true}};
  await syncNormalizedWindow(pool,'perevozki',[payload],'2026-09-01','2026-09-17');
  expect((await db.query('SELECT payload FROM cache_perevozki_rows')).rows[0].payload).toEqual(payload);
});
it('uses the documented Auth and setter payload; malformed success remains uncertain',async()=>{
  vi.stubEnv('ONE_C_ZAYAVKA_UPLOAD_LOGIN','test-login');vi.stubEnv('ONE_C_ZAYAVKA_UPLOAD_PASSWORD','test-password');
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({Success:true,Error:''})));vi.stubGlobal('fetch',fetcher);
  expect(await deliverySetter('SetPickupNumber',{Номер:'000123',НомерПикапа:'ZB-1'})).toEqual({ok:true});
  const [url,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toMatch(/SetPickupNumber\/$/);expect(init.headers).toMatchObject({Auth:'Basic test-login:test-password'});
  expect(JSON.parse(String(init.body))).toEqual({Номер:'000123',НомерПикапа:'ZB-1'});
  fetcher.mockResolvedValue(new Response('not-json'));
  expect(await deliverySetter('SetPickupCost',{Номер:'000001',СтоимостьПикапа:0})).toMatchObject({ok:false,uncertain:true});
});
it('retains pickup number and long goods description; rejects overlong mandatory identifiers before sending',()=>{
  const normalized=normalizeZayavkaUploadPayload({ЗаказчикИНН:'7701234567',ПунктОтправки:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',ПунктНазначения:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',ДатаЗабораПлан:'2026-09-17',НомерЗаявкиКлиента:'CLIENT-1',НомерПикапа:'ZB-1',Посылки:[{ШтрихкодЗаказчика:'barcode',Товары:[{ИДОтправления:'ID1',ID:'1',Name:'Goods',ТМЦ:'a'.repeat(900),Количество:0}]}]});
  if(!normalized.ok)throw new Error(normalized.error);
  expect(normalized.payload.НомерПикапа).toBe('ZB-1');expect(normalized.payload.Посылки[0].Товары[0].Количество).toBe(0);
  expect(validateZayavkaForDelivery(normalized.payload)).toBeNull();
  normalized.payload.Посылки[0].Товары[0].ИДОтправления='x'.repeat(26);
  expect(validateZayavkaForDelivery(normalized.payload)).toMatch('ИДОтправления');
});
