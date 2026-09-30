import { invoiceDocSum } from '../invoiceAmounts.js';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Job } from './model.js';
import { PickupError } from './model.js';
import { pickupInvoiceForTransport, readPickupInvoiceLines } from './pickupInvoices.js';
import { isNormalizedCacheReady } from '../documentCacheNormalized.js';
import { buildPickupCustomerQuote } from './customerQuote.js';
import { persistResolvedPickupCoords, resolvePickupPointCoords } from './pvzCoords.js';
import { deliveryRequestPreview, deliverySetter } from './deliveryService.js';

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
/** Read-only link for pickup cards; never calculates or sends billing. */
export async function resolvePickupTransportNumbers(pool: Pool, jobs: Job[]): Promise<void> {
  const candidates = jobs.filter(job => job.data.zayavkaNumber?.trim() || job.data.cargoNumber?.trim());
  if (!candidates.length) return;
  let rows: any[];
  try { rows = await transports(pool, candidates); }
  catch (error) {
    if ((error as { code?: string }).code === '42P01' || error instanceof PickupError) return;
    throw error;
  }
  for (const job of candidates) {
    try { job.linked_transport_number = transportNumber(matchBillingTransport(job, rows)); }
    catch { /* Missing or ambiguous matches must not invent a transport link. */ }
  }
}

function sourceFor(job: Job, row: any) {
  return { transportNumber: transportNumber(row), pickupNumber: job.job_number, customerInn: job.data.customerInn,
    orderNumber: job.data.zayavkaNumber, ...transportMetrics(row), mode: job.data.customerBillMode,
    city: job.city, km: job.data.mkadKm, latitude: job.data.latitude ?? null, longitude: job.data.longitude ?? null };
}
/** Calculate a draft amount only; does not save billing state or call 1C. */
export async function billingQuote(pool: Pool, body: any) {
  const job = (await pool.query<Job>("SELECT * FROM pickup_jobs WHERE id=$1", [body.id])).rows[0];
  const billing = (await pool.query("SELECT status,version FROM pickup_billing WHERE job_id=$1", [body.id])).rows[0];
  if (!job || job.status !== 'deposited' || !job.data.issueCustomerBill || !billing || billing.status !== 'not_issued' || billing.version !== body.version) {
    throw new PickupError('Данные изменились. Обновите журнал перед расчётом.', 409);
  }
  const source = sourceFor(job, matchBillingTransport(job, await transports(pool, [job])));
  if (source.weight == null || source.volume == null || source.chargeableWeight == null) throw new PickupError('В перевозке нет веса, объёма или платного веса для расчёта');
  const coords = await resolvePickupPointCoords(pool, job.city, job.data);
  const quote = await buildPickupCustomerQuote(pool, {city:job.city, weightKg:source.weight, volumeM3:source.volume,
    chargeableWeightKg:source.chargeableWeight, kmOverride:job.data.mkadKm,
    latitude:coords?.latitude ?? job.data.latitude ?? null, longitude:coords?.longitude ?? job.data.longitude ?? null});
  return {amount:Math.round(quote.totalRub)};
}

export async function billingJournal(pool: Pool, city: string, date: string, actor: string, onlyJobId?: string, dateTo: string = date) {
  if (!['moscow','kaliningrad'].includes(city) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateTo < date) throw new PickupError('Укажите город и дату');
  const { rows: jobs } = await pool.query<Job>(`SELECT *,to_char(date,'YYYY-MM-DD') AS billing_date FROM pickup_jobs WHERE city=$1 AND date BETWEEN $2::date AND $4::date AND status='deposited' AND data->>'issueCustomerBill'='true' AND ($3::uuid IS NULL OR id=$3) ORDER BY date DESC,job_number`,[city,date,onlyJobId ?? null,dateTo]);
  const cargos = jobs.length ? await transports(pool,jobs) : [];
  const invoiceLines = jobs.length ? await readPickupInvoiceLines(pool,`${date.slice(0,4)}-01-01`,`${dateTo.slice(0,4)}-12-31`) : [];
  async function prepareRow(job: Job) {
    let error: string | null = null, source: ReturnType<typeof sourceFor> | null = null, amount: number | null = null;
    let invoiceNumber = '';
    let invoiceReferenceDate: string | undefined;
    let invoiceCustomer: string | undefined;
    try {
      const transport = matchBillingTransport(job,cargos);
      invoiceNumber = pickupInvoiceForTransport(invoiceLines,transportNumber(transport),(job as Job & {billing_date:string}).billing_date.slice(0,4),text(job.data.customerInn));
      source = sourceFor(job, transport);
      if (job.data.customerBillMode === 'auto') {
        if (source.weight == null || source.volume == null || source.chargeableWeight == null || source.places == null) throw new Error('В перевозке отсутствуют места, вес, объём или платный вес');
        let resolved = await resolvePickupPointCoords(pool, job.city, job.data);
        if (resolved && (job.data.latitude == null || job.data.longitude == null)) {
          job.data = await persistResolvedPickupCoords(pool, job, resolved, actor);
          resolved = {
            ...resolved,
            latitude: job.data.latitude as number,
            longitude: job.data.longitude as number,
          };
        }
        amount = (await buildPickupCustomerQuote(pool, {city:job.city,weightKg:source.weight,volumeM3:source.volume,
          chargeableWeightKg:source.chargeableWeight,kmOverride:job.data.mkadKm,
          latitude: resolved?.latitude ?? job.data.latitude,longitude: resolved?.longitude ?? job.data.longitude})).totalRub;
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
    // Round only unissued calculator amounts; preserve amounts already sent to 1C.
    await pool.query(`UPDATE pickup_billing SET amount=round(amount),version=version+1,updated_at=now(),updated_by=$2
      WHERE job_id=$1 AND source->>'mode'='auto' AND status IN ('not_issued','manual') AND amount<>round(amount)`,[job.id,actor]);
    const record = (await pool.query('SELECT * FROM pickup_billing WHERE job_id=$1',[job.id])).rows[0];
    if(record?.amount_manual && source && JSON.stringify(source)!==JSON.stringify(Object.fromEntries(Object.keys(source).map(key=>[key,record.source[key]])))) {
      error='Данные перевозки изменились. Проверьте и сохраните сумму заново.';
    }
    if (record?.status === 'issued') {
      const receipt = (await pool.query(`SELECT detail->>'invoiceNumber' AS number,detail->>'invoiceCustomer' AS customer,coalesce(detail->>'invoiceDate',to_char(created_at,'YYYY-MM-DD')) AS date FROM pickup_billing_events
        WHERE job_id=$1 AND action='issued' AND detail->>'ok'='true' AND COALESCE(detail->>'invoiceNumber','')<>''
        ORDER BY created_at DESC LIMIT 1`,[job.id])).rows[0];
      if (receipt?.number) { invoiceNumber=receipt.number; invoiceReferenceDate=receipt.date; invoiceCustomer=receipt.customer; }
    }
    const sync = (await pool.query('SELECT state,last_error FROM pickup_number_sync WHERE job_id=$1',[job.id])).rows[0];
    let invoiceRequestMethod: string | undefined;
    if (/сч[её]т уже выставлен/i.test(record?.last_error||'')) {
      const attempt=(await pool.query(`SELECT action,detail FROM pickup_billing_events WHERE job_id=$1
        AND action IN ('send_started','invoice_fallback_started') ORDER BY created_at DESC,id DESC LIMIT 1`,[job.id])).rows[0];
      if(attempt) invoiceRequestMethod=attempt.action==='invoice_fallback_started'||attempt.detail?.createInvoice===true?'CreatePickupInvoice':'SetPickupCost';
    }
    const amountManual = Boolean(record?.amount_manual);
    const displayAmount =
      error && !amountManual
        ? null
        : record?.amount == null
          ? null
          : Number(record.amount);
    return { jobId:job.id,jobNumber:job.job_number,date:(job as Job & {billing_date:string}).billing_date,customer:job.data.customerName,sender:job.data.senderName,
      ...record, invoiceNumber, invoiceReferenceDate, invoiceCustomer, invoiceRequestMethod, orderNumber:text(job.data.zayavkaNumber), source: source ?? record?.source, amount: displayAmount, error, numberSync:sync };
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
      manual ? [body.id,body.version,actor] : [body.id,body.version,actor,acceptedSource!.mode==='auto'?Math.round(body.amount):Math.round(body.amount*100)/100,JSON.stringify(acceptedSource),acceptedSource!.transportNumber]);
    if (!rows.rows.length) throw new PickupError('Запись изменилась или действие недоступно. Обновите журнал.',409);
    await db.query('INSERT INTO pickup_billing_events(job_id,actor,action,detail) VALUES($1,$2,$3,$4)',[body.id,actor,manual?'confirmed_issued':'amount_edited',JSON.stringify({amount:rows.rows[0].amount})]);
    await db.query('COMMIT'); return {ok:true, version:rows.rows[0].version};
  } catch(e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
export async function billingPreview(pool:Pool, id:string) {
  const record=(await pool.query('SELECT job_id,amount,transport_number,version,status FROM pickup_billing WHERE job_id=$1',[id])).rows[0];
  if(!record) throw new PickupError('Запись не найдена',404);
  const diagnostics=deliveryRequestPreview('SetPickupCost',{Номер:record.transport_number,СтоимостьПикапа:Number(record.amount)}).diagnostics;
  return {version:record.version,amount:record.amount,transportNumber:record.transport_number,status:record.status,diagnostics};
}
export async function billingSend(pool: Pool, actor: string, body: any, automatic = false) {
  if(body.confirmed !== true) throw new PickupError("Подтвердите передачу стоимости в 1С");
  const retry = !automatic && body.retry === true;
  const createInvoice = !automatic && body.createInvoice === true;
  // One row per HTTP request; the UI performs a bounded sequential batch.
  const db = await pool.connect();
  let claimed: any;
  try {
    await db.query('BEGIN');
    const selected = (await db.query(`SELECT b.*,j.data,j.status AS job_status,j.job_number,j.city FROM pickup_billing b JOIN pickup_jobs j ON j.id=b.job_id WHERE b.job_id=$1 FOR UPDATE OF b,j`,[body.id])).rows[0];
    if (!selected || selected.version !== body.version || !(selected.status === 'not_issued' || (retry && ['manual','uncertain'].includes(selected.status))) || selected.amount == null || selected.job_status !== 'deposited' || !selected.data.issueCustomerBill) throw new PickupError('Обновите журнал: строка изменилась или уже обработана',409);
    if (createInvoice && (!Number.isFinite(Number(selected.amount)) || Number(selected.amount)<=0)) throw new PickupError('Сумма счёта должна быть больше нуля');
    if (automatic && (selected.data.customerBillMode !== 'auto' || !text(selected.data.zayavkaNumber) || selected.amount_manual || selected.last_error)) {
      throw new PickupError('Автоматическая передача недоступна: проверьте расчёт и номер заявки',409);
    }
    const job = {...selected,id:body.id} as Job;
    const actual = sourceFor(job,matchBillingTransport(job,await transports(pool,[job])));
    if (JSON.stringify(actual) !== JSON.stringify(Object.fromEntries(Object.keys(actual).map(key=>[key,selected.source[key]])))) throw new PickupError('Данные перевозки изменились. Обновите журнал и проверьте сумму.',409);
    await db.query("UPDATE pickup_billing SET status='sending',version=version+1,updated_by=$2,updated_at=now() WHERE job_id=$1",[body.id,actor]);
    await db.query("INSERT INTO pickup_billing_events(job_id,actor,action,detail) VALUES($1,$2,'send_started',$3)",[body.id,actor,JSON.stringify({amount:selected.amount,transportNumber:selected.transport_number,automatic,retry,createInvoice})]);
    claimed=selected;
    await db.query('COMMIT');
  } catch(e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
  const method = createInvoice ? 'CreatePickupInvoice' : 'SetPickupCost';
  const payload = createInvoice ? {Номер:claimed.transport_number,Сумма:Number(claimed.amount)} : {Номер:claimed.transport_number,СтоимостьПикапа:Number(claimed.amount)};
  let outcome = retry ? await deliverySetter(method,payload,true) : await deliverySetter(method,payload);
  let invoiceRequested = createInvoice;
  // Only an explicit rejection permits fallback; a timeout or ambiguous response requires reconciliation.
  if (automatic && !outcome.ok && outcome.rejectedByService && !outcome.uncertain && Number(claimed.amount)>0) {
    await pool.query('INSERT INTO pickup_billing_events(job_id,actor,action,detail) VALUES($1,$2,$3,$4)',
      [body.id,actor,'invoice_fallback_started',JSON.stringify({method:'SetPickupCost',outcome,amount:Number(claimed.amount),transportNumber:claimed.transport_number})]);
    invoiceRequested = true;
    outcome = await deliverySetter('CreatePickupInvoice',{Номер:claimed.transport_number,Сумма:Number(claimed.amount)});
  }
  const status=outcome.ok?(invoiceRequested?'issued':'transmitted'):outcome.uncertain?'uncertain':'manual';
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

/** Manual reconciliation uses cached invoice service lines; it never creates a 1C document. */
export async function billingMatchInvoice(pool: Pool, actor: string, body: any) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const row=(await db.query(`SELECT b.*,j.data,j.date,j.status AS job_status FROM pickup_billing b
      JOIN pickup_jobs j ON j.id=b.job_id WHERE b.job_id=$1 FOR UPDATE OF b,j`,[body.id])).rows[0];
    if(!row || row.job_status!=='deposited' || !row.data.issueCustomerBill) throw new PickupError('Забор недоступен',404);
    if(row.status==='sending' && Date.now()-new Date(row.updated_at).getTime()<5*60*1000) throw new PickupError('Дождитесь завершения передачи в 1С',409);
    const {rows}=await db.query(`SELECT i.doc_number AS number,to_char(i.doc_date,'YYYY-MM-DD') AS date,
      i.payload->>'Customer' AS customer,coalesce(i.customer_inn,'') AS inn,
      jsonb_build_object('Sum',coalesce(i.payload->'Sum',i.payload->'sum',i.payload->'Сумма',i.payload->'Amount',i.payload->'SumDoc',i.payload->'SumInvoice',i.payload->'SumBill',i.payload->'СуммаДокумента',i.payload->'СуммаСчета',i.payload->'СуммаСчёта',i.payload->'Total',i.payload->'TotalSum',i.payload->'SumTotal',i.payload->'DocumentSum',i.payload->'СуммаСНДС',i.payload->'SumWithVAT'),
        'List',i.payload->'List','CargoNumber',i.payload->'CargoNumber','NumberCargo',i.payload->'NumberCargo',
        'Perevozka',i.payload->'Perevozka','НомерПеревозки',i.payload->'НомерПеревозки') AS invoice
      FROM cache_invoices_rows i ORDER BY i.doc_date DESC,i.doc_number`);
    const invoices=rows.map(item=>({
      number:item.number,date:item.date,customer:item.customer,inn:item.inn,
      amount:invoiceDocSum(item.invoice),transportNumbers:invoiceTransportNumbers(item.invoice),
      description:(Array.isArray(item.invoice.List)?item.invoice.List:[]).map((line:any)=>text(line.Name)||text(line.Operation)).join('; ')
    }));
    if(body.action==='billing_invoice_candidates') { await db.query('COMMIT');return {invoices}; }
    if(!Number.isInteger(body.version)||row.version!==body.version) throw new PickupError('Запись изменилась. Обновите журнал.',409);
    const selected=invoices.filter(i=>i.number===body.invoiceNumber&&i.date===body.invoiceDate&&(body.invoiceInn===undefined||i.inn===body.invoiceInn));
    if(selected.length!==1) throw new PickupError('Счёт не найден или неоднозначен. Обновите список.');
    const invoice=selected[0];
    await db.query("UPDATE pickup_billing SET status='issued',last_error=NULL,version=version+1,updated_by=$2,updated_at=now() WHERE job_id=$1",[body.id,actor]);
    await db.query('INSERT INTO pickup_billing_events(job_id,actor,action,detail) VALUES($1,$2,$3,$4)',
      [body.id,actor,'issued',JSON.stringify({ok:true,invoiceNumber:invoice.number,invoiceDate:invoice.date,invoiceCustomer:invoice.customer,invoiceInn:invoice.inn,manualMatch:true,previousStatus:row.status,transportNumber:row.transport_number})]);
    await db.query('COMMIT');return {ok:true};
  } catch(e) {await db.query('ROLLBACK');throw e;} finally {db.release();}
}

export async function billingMatchTransport(pool: Pool, actor: string, body: any) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const job=(await db.query<Job>('SELECT * FROM pickup_jobs WHERE id=$1 FOR UPDATE',[body.id])).rows[0];
    if(!job || job.status!=='deposited' || !job.data.issueCustomerBill) throw new PickupError('Забор недоступен',404);
    const billing=(await db.query('SELECT * FROM pickup_billing WHERE job_id=$1 FOR UPDATE',[body.id])).rows[0];
    if(billing && billing.status!=='not_issued') throw new PickupError('Перевозку нельзя менять после передачи стоимости. Требуется сверка.',409);
    const inn=text(job.data.customerInn);
    if(!inn) throw new PickupError('У забора не указан ИНН заказчика');
    if(body.action==='billing_transport_candidates') {
      const search=text(body.search).slice(0,100).toLowerCase();
      let rows:any[];
      if(await isNormalizedCacheReady(pool,'perevozki')) {
        rows=(await db.query(`SELECT payload FROM cache_perevozki_rows
          WHERE coalesce(payload->>'ЗаказчикИНН',payload->>'INN',payload->>'CustomerINN')=$1
          AND (coalesce(payload->>'НомерПикапа',payload->>'PickupNumber','')='' OR coalesce(payload->>'НомерПикапа',payload->>'PickupNumber')=$2)
          AND strpos(lower(concat_ws(' ',payload->>'Number',payload->>'rawNumber',payload->>'НомерПеревозки',payload->>'ZayavkaNumber',payload->>'Sender',payload->>'Receiver')),$3)>0
          ORDER BY coalesce(payload->>'DatePrih','') DESC LIMIT 100`,[inn,job.job_number,search])).rows.map(r=>r.payload);
      } else rows=await transports(pool,[job]);
      const candidates=rows.filter(r=>text(r.ЗаказчикИНН??r.INN??r.CustomerINN)===inn &&
        (!text(r.НомерПикапа??r.PickupNumber)||text(r.НомерПикапа??r.PickupNumber)===job.job_number) &&
        [transportNumber(r),transportOrderNumber(r),r.Sender,r.Receiver].join(' ').toLowerCase().includes(search))
        .slice(0,100).map(r=>({number:transportNumber(r),orderNumber:transportOrderNumber(r),date:text(r.DatePrih),sender:text(r.Sender),receiver:text(r.Receiver),...transportMetrics(r)}));
      await db.query('COMMIT');return {version:job.version,transports:candidates};
    }
    if(!Number.isInteger(body.jobVersion)||body.jobVersion!==job.version) throw new PickupError('Забор изменился. Повторите поиск.',409);
    const number=text(body.transportNumber);
    if(!number) throw new PickupError('Выберите перевозку');
    const proposed={...job,data:{...job.data,cargoNumber:number,zayavkaNumber:''}};
    const all=await transports(pool,[proposed]);
    const exact=all.filter(r=>transportNumber(r)===number);
    if(exact.length!==1) throw new PickupError('Перевозка не найдена или её номер неоднозначен');
    proposed.data.zayavkaNumber=transportOrderNumber(exact[0]) || job.data.zayavkaNumber;
    matchBillingTransport(proposed,all);
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`pickup-transport:${number}`]);
    const conflict=await db.query(`SELECT id FROM pickup_jobs WHERE id<>$1 AND data->>'cargoNumber'=$2
      UNION ALL SELECT job_id FROM pickup_billing WHERE job_id<>$1 AND transport_number=$2`,[job.id,number]);
    if(conflict.rows.length) throw new PickupError('Перевозка уже сопоставлена с другим забором',409);
    await db.query('UPDATE pickup_jobs SET data=$2,version=version+1,updated_at=now() WHERE id=$1',[job.id,JSON.stringify(proposed.data)]);
    await db.query('INSERT INTO pickup_events(id,job_id,actor,action,data) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(),job.id,actor,'transport_matched',JSON.stringify({previousCargoNumber:job.data.cargoNumber,previousOrderNumber:job.data.zayavkaNumber,cargoNumber:number,orderNumber:proposed.data.zayavkaNumber})]);
    await db.query('COMMIT');return {ok:true};
  } catch(e) {await db.query('ROLLBACK');throw e;} finally {db.release();}
}

function invoiceTransportNumbers(invoice:Record<string,any>):string[] {
  const numbers=new Set<string>();
  for(const entry of [invoice,...(Array.isArray(invoice.List)?invoice.List:[])]) {
    for(const key of ['CargoNumber','NumberCargo','Perevozka','НомерПеревозки']) {
      const value=text(entry[key]);if(/^\d+$/.test(value))numbers.add(value);
    }
    for(const key of ['Name','Operation']) {
      for(const match of text(entry[key]).matchAll(/перевозк[аи]\s*№?\s*(\d+)/gi))numbers.add(match[1]);
    }
  }
  return [...numbers];
}
