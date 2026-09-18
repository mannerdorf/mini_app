import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';
import {getRequestSignal} from './requestCancellation.js';

const context=new AsyncLocalStorage<boolean>();
export const withOneCPriority=<T>(background:boolean,fn:()=>T):T=>context.run(background,fn);
export function isOneCUrl(input:string|URL|Request):boolean {
  try {const url=new URL(input instanceof Request?input.url:String(input));return url.hostname==='tdn.postb.ru' && url.pathname.startsWith('/workbase/hs/');} catch{return false;}
}
export async function acquireOneCGate(pool:Pool,token:string,priority:number) {
  await pool.query(`INSERT INTO one_c_request_waiters(token,priority,expires_at) VALUES($1,$2,now()+interval '6 minutes') ON CONFLICT DO NOTHING`,[token,priority]);
  return (await pool.query(`UPDATE one_c_request_gate SET token=$1,lease_until=now()+interval '150 seconds'
    WHERE id=1 AND (lease_until IS NULL OR lease_until<now()) AND next_at<=now()
    AND ($2=0 OR background_pause_until IS NULL OR background_pause_until<=now())
    AND NOT EXISTS(SELECT 1 FROM one_c_request_waiters w WHERE w.expires_at>now() AND
      (w.priority<$2 OR (w.priority=$2 AND w.created_at<(SELECT created_at FROM one_c_request_waiters WHERE token=$1)))) RETURNING id`,[token,priority])).rows.length>0;
}
let installed=false;
/** VPS API and cron share one DB gate; no request bodies or credentials are stored. */
export function installOneCRequestGate(getPool:()=>Pool) {
  if(installed) return; installed=true;
  const original=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async(input,init)=>{
    if(!isOneCUrl(input)) return original(input,init);
    const pool=getPool(),token=randomUUID(),background=context.getStore()===true;
    const signals=[init?.signal,input instanceof Request?input.signal:null,getRequestSignal(),AbortSignal.timeout(240000)].filter(Boolean) as AbortSignal[];
    const signal=AbortSignal.any(signals);
    let acquired=false,failed=false;
    try {
      while(!acquired) {
        signal.throwIfAborted();
        acquired=await acquireOneCGate(pool,token,background?1:0);
        if(!acquired) await delay(1000,undefined,{signal});
      }
      const response=await original(input,{...init,signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});
      // Keep the gate through response-body consumption, not just through headers.
      const bytes=await response.arrayBuffer();
      failed=response.status===429 || response.status>=500;
      return new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
    } catch(e) {failed=true;throw e;}
    finally {
      try {
        if(acquired) await pool.query(`UPDATE one_c_request_gate SET token=NULL,lease_until=NULL,next_at=now()+interval '2 seconds',
          failures=CASE WHEN $2 THEN failures+1 ELSE 0 END,
          background_pause_until=CASE WHEN $2 AND failures>=2 THEN now()+interval '15 minutes' ELSE NULL END
          WHERE id=1 AND token=$1`,[token,failed]);
      } catch {
        console.error('one_c_gate_release_failed');
      } finally {
        await pool.query('DELETE FROM one_c_request_waiters WHERE token=$1 OR expires_at<now()',[token]).catch(() => console.error('one_c_waiter_cleanup_failed'));
      }
    }
  };
}
