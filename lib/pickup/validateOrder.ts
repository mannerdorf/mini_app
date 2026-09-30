import type { PoolClient } from 'pg';
import { PickupError } from './model.js';
import { cacheHistoryDateFrom, getPerevozkiServiceCredentials } from '../cacheHistoryDays.js';
import { fetchServiceJson } from '../documentCacheRefreshCore.js';
import { POST_ZAYAVKA_URL } from '../post1cZayavkaUpload.js';

const text=(v:unknown)=>String(v??'').trim();
const normalized=(v:unknown)=>/^\d+$/.test(text(v))?text(v).replace(/^0+/,'')||'0':text(v);
export function findCustomerOrder(rows:any[],number:string,inn:string) {
  const matches=rows.filter(r=>text(r.ЗаказчикИНН)===inn && [r.Номер,r.НомерЗаявкиКлиента].some(v=>text(v)&&normalized(v)===normalized(number)));
  const unique=new Map(matches.map(r=>[text(r.Ссылка)||text(r.Номер),r]));
  if(unique.size>1) throw new PickupError('Найдено несколько заявок. Уточните номер заявки');
  return [...unique.values()][0];
}
/** Validate customer ownership before saving a driver's order number. No 1C writes. */
export async function validatePickupOrder(db:Pick<PoolClient,'query'>,number:string,inn:string) {
  number=text(number);inn=text(inn);
  if(!number||number.length>100) throw new PickupError('Введите номер заявки: от 1 до 100 символов');
  if(!inn) throw new PickupError('У забора не указан ИНН заказчика. Обратитесь к диспетчеру');
  const cached=(await db.query('SELECT data FROM cache_orders WHERE id=1')).rows[0]?.data;
  const found=findCustomerOrder(Array.isArray(cached)?cached:[],number,inn);
  if(found) return {number:text(found.Номер),source:'db'};
  const credentials=getPerevozkiServiceCredentials();
  if(!credentials) throw new PickupError('Не удалось проверить заявку в 1С. Обратитесь к диспетчеру',503);
  const base=process.env.ONE_C_DELIVERY_BASE_URL || POST_ZAYAVKA_URL.replace(/PostZayavka2\/?$/,'');
  const today=new Date();const end=new Date(today.getTime()+86400000).toISOString().slice(0,10);
  const recent=new Date(today);recent.setUTCDate(recent.getUTCDate()-30);
  const recentStart=recent.toISOString().slice(0,10);
  const previousEnd=new Date(recent);previousEnd.setUTCDate(previousEnd.getUTCDate()-1);
  const ranges=[[recentStart,end],[cacheHistoryDateFrom(today),previousEnd.toISOString().slice(0,10)]];
  for(const [from,to] of ranges) {
    if(from>to) continue;
    let rows:any;
    try {
      rows=await fetchServiceJson(credentials.login,credentials.password,`${base.replace(/\/$/,'')}/GetZayavki?DateB=${from}&DateE=${to}`);
      if(!Array.isArray(rows)||rows.some(r=>!r||typeof r!=='object'||!r.Номер||!r.ЗаказчикИНН)) throw new Error('Invalid orders response');
    } catch {throw new PickupError('Не удалось проверить заявку в 1С. Повторите проверку позже',503);}
    const order=findCustomerOrder(rows,number,inn);
    if(!order) continue;
    // Append only the verified record; do not mark the entire cache freshly synchronized.
    await db.query(`INSERT INTO cache_orders(id,data,fetched_at) VALUES(1,$1,'1970-01-01')
      ON CONFLICT(id) DO UPDATE SET data=CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(cache_orders.data) r WHERE r->>'Номер'=$2 AND r->>'ЗаказчикИНН'=$3
      ) THEN cache_orders.data ELSE coalesce(cache_orders.data,'[]'::jsonb)||EXCLUDED.data END`,[JSON.stringify([order]),text(order.Номер),inn]);
    return {number:text(order.Номер),source:'1c'};
  }
  throw new PickupError('Заявка не найдена');
}
