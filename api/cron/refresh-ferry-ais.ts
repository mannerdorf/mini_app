import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getPool} from '../_db.js';
import {requireCronAuth} from '../_lib/cronAuth.js';
import {requestFerryLatest} from '../../lib/ferryAisCache.js';

/** Only ferries attached to sendings whose transit is still open. No 1C calls. */
export default async function handler(req:VercelRequest,res:VercelResponse) {
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const auth=requireCronAuth(req);if(auth)return res.status(auth.status).json({error:auth.error});
  const key=process.env.MARINESIA_API_KEY?.trim();if(!key)return res.status(503).json({error:'MARINESIA_API_KEY not configured'});
  const pool=getPool();const client=await pool.connect();
  try {
    const locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('ferry-ais-refresh')) AS locked")).rows[0]?.locked;
    if(!locked)return res.status(200).json({ok:true,skipped:true});
    try {
      const rows=(await client.query(`SELECT DISTINCT f.mmsi FROM ferries f
        JOIN sendings_ferry sf ON sf.ferry_id=f.id
        JOIN sendings_metrics m ON ltrim(btrim(sf.row_key),'0')=ltrim(btrim(m.sending_number),'0') AND (sf.inn IS NULL OR sf.inn=m.customer_inn)
        WHERE m.send_start_at IS NOT NULL AND (m.first_ready_at IS NULL OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(m.cargo_numbers) cargo(number)
            JOIN cache_perevozki_rows c ON ltrim(btrim(c.doc_number),'0')=ltrim(btrim(cargo.number),'0')
            WHERE lower(coalesce(c.payload->>'State',c.payload->>'state',c.payload->>'Статус',c.payload->>'Status',c.payload->>'StatusName','')) ~ '(пути|отправлен|улетела)'
              AND lower(coalesce(c.payload->>'State',c.payload->>'state',c.payload->>'Статус',c.payload->>'Status',c.payload->>'StatusName','')) !~ '(доставлен|заверш)'
          ))
          AND f.mmsi ~ '^[0-9]{9}$' ORDER BY f.mmsi`)).rows;
      const results=[];
      for(const {mmsi} of rows) {
        const url=new URL(`https://api.marinesia.com/api/v1/vessel/${mmsi}/location/latest`);url.searchParams.set('key',key);
        try {const r=await requestFerryLatest(url.toString(),undefined,2*60*60*1000);results.push({mmsi,ok:r.ok,status:r.status});}
        catch {results.push({mmsi,ok:false,status:502});}
      }
      return res.status(results.some(r=>!r.ok)?502:200).json({ok:results.every(r=>r.ok),checked_at:new Date().toISOString(),results});
    } finally {await client.query("SELECT pg_advisory_unlock(hashtext('ferry-ais-refresh'))");}
  } catch {return res.status(500).json({error:'Не удалось обновить AIS паромов'});}
  finally {client.release();}
}
