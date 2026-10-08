import {getPool} from '../api/_db.js';
import {requestMarinesia} from './marinesiaRequest.js';

/** Shared latest-position cache for API and cron workers; history remains separate. */
export async function requestFerryLatest(url:string,init?:RequestInit,ttl=300000):Promise<Response> {
  const mmsi=new URL(url).pathname.match(/\/vessel\/(\d{9})\/location\/latest$/)?.[1];
  if(!mmsi)return requestMarinesia(url,init,ttl);
  try {
    const row=(await getPool().query('SELECT payload FROM ferry_ais_cache WHERE mmsi=$1 AND checked_at>now()-($2*interval \'1 millisecond\')',[mmsi,ttl])).rows[0];
    if(row)return Response.json(row.payload);
  } catch { /* Older deployments remain usable before migration 126. */ }
  const response=await requestMarinesia(url,init,ttl);
  if(response.ok) {
    const payload=await response.clone().json() as {data?:unknown;error?:boolean};
    if(payload?.data && payload.error!==true)try {
      await getPool().query('INSERT INTO ferry_ais_cache(mmsi,payload,checked_at) VALUES($1,$2,now()) ON CONFLICT(mmsi) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at',[mmsi,JSON.stringify(payload)]);
    } catch { /* A cache failure must not suppress an available AIS response. */ }
  }
  return response;
}
