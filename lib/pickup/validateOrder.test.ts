import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
vi.mock('../documentCacheRefreshCore.js',()=>({fetchServiceJson:vi.fn()}));
vi.mock('../cacheHistoryDays.js',()=>({cacheHistoryDateFrom:()=> '2025-01-01',getPerevozkiServiceCredentials:()=>({login:'fixture',password:'fixture'})}));
vi.mock('../post1cZayavkaUpload.js',()=>({POST_ZAYAVKA_URL:'https://example.test/hs/DeliveryWebService/PostZayavka2/'}));
import {fetchServiceJson} from '../documentCacheRefreshCore.js';
import {validatePickupOrder} from './validateOrder.js';
let db:PGlite;
const order={Номер:'000123',НомерЗаявкиКлиента:'ABC',ЗаказчикИНН:'100',Ссылка:'uuid'};
beforeAll(async()=>{db=new PGlite();await db.exec("CREATE TABLE cache_orders(id int primary key,data jsonb not null,fetched_at timestamptz not null)");});
afterAll(()=>db.close());
beforeEach(async()=>{vi.mocked(fetchServiceJson).mockReset();await db.exec('TRUNCATE cache_orders');});
it('uses a customer-scoped cache hit without 1C and preserves canonical zeros',async()=>{
 await db.query("INSERT INTO cache_orders VALUES(1,$1,'2026-01-01T00:00:00Z')",[JSON.stringify([order])]);
 expect(await validatePickupOrder(db as any,'123','100')).toEqual({number:'000123',source:'db'});
 expect(fetchServiceJson).not.toHaveBeenCalled();
});
it('falls back to 1C and caches only the found customer order without refreshing the snapshot age',async()=>{
 await db.query("INSERT INTO cache_orders VALUES(1,$1,'2026-01-01T00:00:00Z')",[JSON.stringify([{...order,ЗаказчикИНН:'other'}])]);
 vi.mocked(fetchServiceJson).mockResolvedValue([order]);
 expect(await validatePickupOrder(db as any,'ABC','100')).toEqual({number:'000123',source:'1c'});
 const row=(await db.query('SELECT * FROM cache_orders')).rows[0] as any;
 expect(row.data).toHaveLength(2);expect(new Date(row.fetched_at).toISOString()).toBe('2026-01-01T00:00:00.000Z');
 expect(await validatePickupOrder(db as any,'123','100')).toMatchObject({source:'db'});
 expect(fetchServiceJson).toHaveBeenCalledTimes(1);
});
it('searches older history after the recent window and handles an uninitialized cache',async()=>{
 vi.mocked(fetchServiceJson).mockResolvedValueOnce([]).mockResolvedValueOnce([order]);
 expect(await validatePickupOrder(db as any,'123','100')).toMatchObject({number:'000123'});
 expect(fetchServiceJson).toHaveBeenCalledTimes(2);
});
it('reports not found only after both windows lack an order for this customer',async()=>{
 vi.mocked(fetchServiceJson).mockResolvedValue([{...order,ЗаказчикИНН:'other'}]);
 await expect(validatePickupOrder(db as any,'123','100')).rejects.toThrow('Заявка не найдена');
 expect(fetchServiceJson).toHaveBeenCalledTimes(2);
});
it.each([null,{Success:false},[{Номер:'123'}]])('rejects malformed responses instead of reporting not found: %j',async(response)=>{
 vi.mocked(fetchServiceJson).mockResolvedValue(response);
 await expect(validatePickupOrder(db as any,'123','100')).rejects.toThrow('Не удалось проверить');
});
it('distinguishes an outage from an absent order',async()=>{
 vi.mocked(fetchServiceJson).mockRejectedValue(new Error('timeout'));
 await expect(validatePickupOrder(db as any,'123','100')).rejects.toThrow('Не удалось проверить');
});
it('rejects ambiguity for the same customer',async()=>{
 await db.query("INSERT INTO cache_orders VALUES(1,$1,'2026-01-01T00:00:00Z')",[JSON.stringify([order,{...order,Ссылка:'second'}])]);
 await expect(validatePickupOrder(db as any,'123','100')).rejects.toThrow('несколько заявок');
 expect(fetchServiceJson).not.toHaveBeenCalled();
});
