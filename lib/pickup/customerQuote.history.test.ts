import {afterAll,beforeAll,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {buildPickupCustomerQuote} from './customerQuote.js';
const db=new PGlite();
const pool:any={query:(sql:string,params?:any[])=>db.query(sql,params)};
beforeAll(async()=>{
 await db.exec(`CREATE TABLE haulz_calc_tariff_sets(id int,code text,name text,block text,direction text);
 CREATE TABLE haulz_calc_tariff_versions(id int,tariff_set_id int,effective_from date,payload jsonb,comment text,created_by text,created_at timestamp);
 INSERT INTO haulz_calc_tariff_sets VALUES (1,'pickup_matrix','Pickup','pickup',NULL),(2,'calc_boxes','Boxes','extras',NULL),(3,'calc_rigid_packaging','Packing','extras',NULL);`);
 for(const [id,date,fee] of [[1,'2026-01-01',1350],[2,'2026-09-01',2000]] as const) {
  await db.query('INSERT INTO haulz_calc_tariff_versions(id,tariff_set_id,effective_from,payload) VALUES($1,1,$2,$3)',[id,date,JSON.stringify({scope:'pickup',cities:{moscow:{tiers:[{weight_max_kg:100,volume_max_m3:1,city_fee:fee,per_km:0}]}}})]);
 }
});
afterAll(()=>db.close());
const quote=(asOfDate:string)=>buildPickupCustomerQuote(pool,{city:'moscow',weightKg:10,volumeM3:0.1,latitude:null,longitude:null,kmOverride:0,asOfDate});
it('uses the earlier tariff before the change and the new tariff on its effective date',async()=>{
 expect(await quote('2026-08-31')).toMatchObject({totalRub:1350,tariffVersionId:1,tariffEffectiveFrom:'2026-01-01'});
 expect(await quote('2026-09-01')).toMatchObject({totalRub:2000,tariffVersionId:2,tariffEffectiveFrom:'2026-09-01'});
});
it('does not substitute current tariffs when there is no historical version',async()=>{
 await expect(quote('2025-12-31')).rejects.toThrow('на 2025-12-31');
 await expect(quote('2026-02-30')).rejects.toThrow('Некорректная дата');
});
