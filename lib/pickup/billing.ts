import type { Pool } from 'pg';
import type { Job } from './model.js';
import { PickupError } from './model.js';
import { isNormalizedCacheReady } from '../documentCacheNormalized.js';
import { buildPickupCustomerQuote } from './customerQuote.js';
import { deliverySetter } from './deliveryService.js';

const text = (value: unknown) => String(value ?? '').trim();
export function transportMetrics(row: any) {
  function number(value: unknown): number | null {
    if (value == null || text(value) === '') return null;
    const n = Number(text(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return { places: number(row.Mest), weight: number(row.W), volume: number(row.Value), chargeableWeight: number(row.PW) };
}
export function transportNumber(row: any) { return text(row.rawNumber ?? row.Number ?? row.НомерПеревозки); }
export function transportOrderNumber(row: any) { return text(row.ZayavkaNumber); }

function sameDocumentNumber(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const bare = (value: string) => (/^\d+$/.test(value) ? value.replace(/^0+/, '') || '0' : value);
  return bare(left) === bare(right);
}

function requestLookupKeys(value: string): string[] {
  const raw = text(value);
  if (!raw) return [];
  const bare = /^\d+$/.test(raw) ? raw.replace(/^0+/, '') || '0' : raw;
  return bare === raw ? [raw] : [raw, bare];
}

export function matchBillingTransport(job: Job, rows: any[]) {
  const inn = text(job.data.customerInn);
  if (!inn) throw new Error('У забора не указан ИНН заказчика');
  const sameInn = (row: any) => text(row.ЗаказчикИНН ?? row.INN ?? row.CustomerINN) === inn;
  const request = text(job.data.zayavkaNumber);
  const matches = rows.filter(row => sameInn(row) &&
    (text(row.НомерПикапа ?? row.PickupNumber) === text(job.job_number) ||
     (text(job.data.cargoNumber) !== '' && transportNumber(row) === text(job.data.cargoNumber)) ||
     (request !== '' && sameDocumentNumber(transportOrderNumber(row), request))));
  if (matches.length !== 1) throw new Error(matches.length ? 'Найдено несколько перевозок: требуется сверка' : 'Перевозка не найдена: проверьте номер заявки, забора или перевозки и загрузку из 1С');
  const row = matches[0];
  const pickup = text(row.НомерПикапа ?? row.PickupNumber);
  if (pickup && pickup !== text(job.job_number)) throw new Error('Перевозка связана с другим забором');
  if (job.data.cargoNumber && transportNumber(row) !== text(job.data.cargoNumber)) throw new Error('Номер перевозки в заборе не совпадает с данными 1С');
  const order = transportOrderNumber(row);
  if (order && request && !sameDocumentNumber(order, request)) throw new Error('Номер заявки в заборе не совпадает с данными перевозки');
  const number = transportNumber(row);
  // SetPickupCost has no INN/UUID parameter: reject a globally ambiguous number.
  if (!number || rows.filter(r => transportNumber(r) === number).length !== 1) throw new Error('Номер перевозки неоднозначен для SetPickupCost');
  return row;
}
async function transports(pool: Pool, jobs: Pick<Job,'job_number'|'data'>[]): Promise<any[]> {
  if (await isNormalizedCacheReady(pool, 'perevozki')) {
    const pickupNumbers=jobs.map(j=>j.job_number).filter(Boolean), cargoNumbers=jobs.map(j=>j.data.cargoNumber).filter(Boolean);
    const orderNumbers=[...new Set(jobs.flatMap(j=>requestLookupKeys(j.data.zayavkaNumber)))];
    // Keep the untouched payload and expand candidate document numbers across
    // customers, because SetPickupCost cannot disambiguate them using INN.
    return (await pool.query(`WITH candidates AS (
      SELECT payload FROM cache_perevozki_rows WHERE coalesce(payload->>'НомерПикапа',payload->>'PickupNumber')=ANY($1::text[])
      OR coalesce(payload->>'rawNumber',payload->>'Number',payload->>'НомерПеревозки')=ANY($2::text[])
      OR btrim(coalesce(payload->>'ZayavkaNumber',''))=ANY($3::text[])
      OR ltrim(btrim(coalesce(payload->>'ZayavkaNumber','')),'0')=ANY($3::text[]))
      SELECT payload FROM cache_perevozki_rows WHERE coalesce(payload->>'rawNumber',payload->>'Number',payload->>'НомерПеревозки') IN
      (SELECT coalesce(payload->>'rawNumber',payload->>'Number',payload->>'НомерПеревозки') FROM candidates)`,[pickupNumbers,cargoNumbers,orderNumbers])).rows.map(row => row.payload);
  }
  const raw = (await pool.query('SELECT data FROM cache_perevozki WHERE id=1')).rows[0]?.data;
  if (!Array.isArray(raw)) throw new PickupError('Перевозки ещё не загружены в БД', 503);
  return raw;
}
function sourceFor(job: Job, row: any) {
  return { transportNumber: transportNumber(row), pickupNumber: job.job_number, customerInn: job.data.customerInn,
    orderNumber: job.data.zayavkaNumber, ...transportMetrics(row), mode: job.data.customerBillMode,
    city: job.city, km: job.data.mkadKm, latitude: job.data.latitude ?? null, longitude: job.data.longitude ?? null };
}
export async function billingJournal(pool: Pool, city: string, date: string, actor: string) {
  if (!['moscow','kaliningrad'].includes(city) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new PickupError('Укажите город и дату');
  const { rows: jobs } = await pool.query<Job>(`SELECT * FROM pickup_jobs WHERE city=$1 AND date=$2 AND status='deposited' AND data->>'issueCustomerBill'='true' ORDER BY job_number`,[city,date]);
  const cargos = jobs.length ? await transports(pool,jobs) : [];
  async function prepareRow(job: Job) {
    let error: string | null = null, source: ReturnType<typeof sourceFor> | null = null, amount: number | null = null;
    try {
      source = sourceFor(job, matchBillingTransport(job,cargos));
      if (job.data.customerBillMode === 'auto') {
        if (source.weight == null || source.volume == null || source.chargeableWeight == null || source.places == null) throw new Error('В перевозке отсутствуют места, вес, объём или платный вес');
        amount = (await buildPickupCustomerQuote(pool, {city:job.city,weightKg:source.weight,volumeM3:source.volume,
          chargeableWeightKg:source.chargeableWeight,kmOverride:job.data.mkadKm,latitude:job.data.latitude,longitude:job.data.longitude})).totalRub;
      }
    } catch (e) { error = (e as Error).message; }
    if (source) {
      const duplicate=await pool.query('SELECT job_id FROM pickup_billing WHERE transport_number=$1 AND job_id<>$2',[source.transportNumber,job.id]);
      if(duplicate.rows.length) {error='Эта перевозка уже есть в журнале другого забора';source=null;}
    }
    if (source) {
      try {
      await pool.query(`INSERT INTO pickup_billing(job_id,transport_number,source,amount,updated_by,last_error)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(job_id) DO UPDATE SET
        source=EXCLUDED.source,transport_number=EXCLUDED.transport_number,
        amount=CASE WHEN pickup_billing.amount_manual THEN pickup_billing.amount ELSE EXCLUDED.amount END,
        last_error=EXCLUDED.last_error,version=pickup_billing.version+1,updated_at=now()
        WHERE pickup_billing.status='not_issued' AND NOT pickup_billing.amount_manual AND (pickup_billing.source IS DISTINCT FROM EXCLUDED.source
          OR pickup_billing.last_error IS DISTINCT FROM EXCLUDED.last_error
          OR (NOT pickup_billing.amount_manual AND pickup_billing.amount IS DISTINCT FROM EXCLUDED.amount))`,
        [job.id,source.transportNumber,JSON.stringify(source),amount,actor,error]);
      } catch (e) {
        if ((e as {code?:string}).code !== '23505') throw e;
        error='Эта перевозка уже есть в журнале другого забора'; source=null;
      }
    }
    const record = (await pool.query('SELECT * FROM pickup_billing WHERE job_id=$1',[job.id])).rows[0];
    if(record?.amount_manual && source && JSON.stringify(source)!==JSON.stringify(Object.fromEntries(Object.keys(source).map(key=>[key,record.source[key]])))) {
      error='Данные перевозки изменились. Проверьте и сохраните сумму заново.';
    }
    const sync = (await pool.query('SELECT state,last_error FROM pickup_number_sync WHERE job_id=$1',[job.id])).rows[0];
    return { jobId:job.id,jobNumber:job.job_number,date,customer:job.data.customerName,
      ...record, orderNumber:text(job.data.zayavkaNumber), source: source ?? record?.source, amount:record?.amount == null ? null : Number(record.amount), error, numberSync:sync };
  }
  const result=[];
  for(let index=0;index<jobs.length;index+=3) result.push(...await Promise.all(jobs.slice(index,index+3).map(prepareRow)));
  return {rows:result};
}
export async function billingEdit(pool: Pool, actor: string, body: any) {
  if (!Number.isInteger(body.version)) throw new PickupError('Обновите журнал');
  const manual = body.action === 'billing_mark_issued';
  if (!manual && (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount<0 || body.amount>999999999999.99)) throw new PickupError('Введите корректную сумму');
  let acceptedSource: ReturnType<typeof sourceFor> | null = null;
  if(!manual) {
    const job=(await pool.query<Job>('SELECT * FROM pickup_jobs WHERE id=$1',[body.id])).rows[0];
    if(!job || job.status!=='deposited' || !job.data.issueCustomerBill) throw new PickupError('Забор недоступен для выставления счёта');
    acceptedSource=sourceFor(job,matchBillingTransport(job,await transports(pool,[job])));
  }
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const rows = await db.query(`UPDATE pickup_billing SET ${manual ? "status='issued'" : 'amount=$4,amount_manual=true,source=$5,transport_number=$6'},
      version=version+1,updated_by=$3,updated_at=now() WHERE job_id=$1 AND version=$2
      AND status IN (${manual ? "'manual','uncertain','sending'" : "'not_issued','manual'"}) AND (status<>'sending' OR updated_at<now()-interval '5 minutes') RETURNING *`,
      manual ? [body.id,body.version,actor] : [body.id,body.version,actor,Math.round(body.amount*100)/100,JSON.stringify(acceptedSource),acceptedSource!.transportNumber]);
    if (!rows.rows.length) throw new PickupError('Запись изменилась или действие недоступно. Обновите журнал.',409);
    await db.query('INSERT INTO pickup_billing_events(job_id,actor,action,detail) VALUES($1,$2,$3,$4)',[body.id,actor,manual?'confirmed_issued':'amount_edited',JSON.stringify({amount:rows.rows[0].amount})]);
    await db.query('COMMIT'); return {ok:true};
  } catch(e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
export async function billingSend(pool: Pool, actor: string, body: any) {
  if(body.confirmed !== true) throw new PickupError("Подтвердите передачу стоимости в 1С");
  // One row per HTTP request; the UI performs a bounded sequential batch.
  const db = await pool.connect();
  let claimed: any;
  try {
    await db.query('BEGIN');
    const selected = (await db.query(`SELECT b.*,j.data,j.status AS job_status,j.job_number,j.city FROM pickup_billing b JOIN pickup_jobs j ON j.id=b.job_id WHERE b.job_id=$1 FOR UPDATE OF b,j`,[body.id])).rows[0];
    if (!selected || selected.version !== body.version || selected.status !== 'not_issued' || selected.amount == null || selected.job_status !== 'deposited' || !selected.data.issueCustomerBill) throw new PickupError('Обновите журнал: строка изменилась или уже обработана',409);
    const job = {...selected,id:body.id} as Job;
    const actual = sourceFor(job,matchBillingTransport(job,await transports(pool,[job])));
    if (JSON.stringify(actual) !== JSON.stringify(Object.fromEntries(Object.keys(actual).map(key=>[key,selected.source[key]])))) throw new PickupError('Данные перевозки изменились. Обновите журнал и проверьте сумму.',409);
    await db.query("UPDATE pickup_billing SET status='sending',version=version+1,updated_by=$2,updated_at=now() WHERE job_id=$1",[body.id,actor]);
    await db.query("INSERT INTO pickup_billing_events(job_id,actor,action,detail) VALUES($1,$2,'send_started',$3)",[body.id,actor,JSON.stringify({amount:selected.amount,transportNumber:selected.transport_number})]);
    claimed=selected;
    await db.query('COMMIT');
  } catch(e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
  const outcome = await deliverySetter('SetPickupCost',{Номер:claimed.transport_number,СтоимостьПикапа:Number(claimed.amount)});
  const status=outcome.ok?'transmitted':outcome.uncertain?'uncertain':'manual';
  // If the process stops after the network call, 'sending' is intentionally not retried.
  const finish=await pool.connect();
  try {
    await finish.query('BEGIN');
    await finish.query("UPDATE pickup_billing SET status=$2,last_error=$3,version=version+1,updated_at=now() WHERE job_id=$1 AND status='sending'",[body.id,status,outcome.error || null]);
    await finish.query('INSERT INTO pickup_billing_events(job_id,actor,action,detail) VALUES($1,$2,$3,$4)',[body.id,actor,status,JSON.stringify(outcome)]);
    await finish.query('COMMIT');
  } catch(e) { await finish.query('ROLLBACK'); throw e; } finally { finish.release(); }
  return {...outcome,status,number:claimed.transport_number};
}
