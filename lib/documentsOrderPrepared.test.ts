import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const state=vi.hoisted(()=>({pool:null as any}));
vi.mock('../api/_db.js',()=>({getPool:()=>state.pool}));
import {prepareDocumentsOrder} from './documentsOrderPrepared.js';
import {uploadZayavkaTo1c,type ZayavkaUploadPayload} from './post1cZayavkaUpload.js';
let db:PGlite;
const payload=(client:string):ZayavkaUploadPayload=>({ЗаказчикИНН:'7701234567',ОтправительИНН:'',ПолучательИНН:'',ПунктОтправки:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',ПунктНазначения:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',ДатаЗабораПлан:'2026-09-17',ОГ:false,НомерЗаявкиКлиента:client,Посылки:[{ШтрихкодЗаказчика:'barcode',Товары:[{ИДОтправления:'ID1',ID:'1',Name:'Goods',ТМЦ:'Goods',Количество:1,ОбъявленнаяСтоимостьТовара:0}]}]});
beforeAll(async()=>{
  db=new PGlite();state.pool={query:(s:string,p?:any[])=>db.query(s,p),connect:async()=>({query:(s:string,p?:any[])=>db.query(s,p),release:()=>{}})};
  await db.exec('CREATE TABLE pickup_jobs(id uuid PRIMARY KEY,status text,job_number text,data jsonb);');
  await db.exec(readFileSync('migrations/114_pickup_1c_integration.sql','utf8'));
  await db.exec(readFileSync('migrations/112_one_c_submissions.sql','utf8'));
},30000);
afterAll(()=>db.close());afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('freezes parcel IDs before sending and never reallocates them after retry',async()=>{
  const input=payload('prepare-1');const allocate=vi.fn(async()=>({...input,НомерПикапа:'ZB-1'}));
  expect(await prepareDocumentsOrder(state.pool,'actor',input,allocate)).toMatchObject({НомерПикапа:'ZB-1'});
  expect(await prepareDocumentsOrder(state.pool,'actor',input,allocate)).toMatchObject({НомерПикапа:'ZB-1'});
  expect(allocate).toHaveBeenCalledTimes(1);
  await expect(prepareDocumentsOrder(state.pool,'other',input,allocate)).rejects.toThrow('уже подготавливалась');
  await expect(prepareDocumentsOrder(state.pool,'actor',{...input,ОГ:true},allocate)).rejects.toThrow('уже подготавливалась');
});
it('reads documented Номер and Ссылка and persists them for a replay without another POST',async()=>{
  vi.stubEnv('ONE_C_ZAYAVKA_UPLOAD_LOGIN','test');vi.stubEnv('ONE_C_ZAYAVKA_UPLOAD_PASSWORD','test');
  const reference='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({Success:true,Error:'',Номер:'000000123',Ссылка:reference})));vi.stubGlobal('fetch',fetcher);
  expect(await uploadZayavkaTo1c(payload('create-1'))).toMatchObject({ok:true,nomerZayavki:'000000123',reference});
  expect(await uploadZayavkaTo1c(payload('create-1'))).toMatchObject({ok:true,nomerZayavki:'000000123',reference});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('blocks blind resend after a malformed HTTP 200 creation response',async()=>{
  vi.stubEnv('ONE_C_ZAYAVKA_UPLOAD_LOGIN','test');vi.stubEnv('ONE_C_ZAYAVKA_UPLOAD_PASSWORD','test');
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({Success:true})));vi.stubGlobal('fetch',fetcher);
  expect(await uploadZayavkaTo1c(payload('create-uncertain'))).toMatchObject({ok:false});
  expect(await uploadZayavkaTo1c(payload('create-uncertain'))).toMatchObject({ok:false,status:409});
  expect(fetcher).toHaveBeenCalledTimes(1);
});
