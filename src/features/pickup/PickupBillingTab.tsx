import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, Route } from '../../../lib/pickup/model';
import { cities } from '../../../lib/pickup/model';
import type { PickupCall } from './client';
import { billingAmountText, billingDraftConflicts, editBillingAmount, type BillingDrafts } from './billingDrafts';

type Row = {orderNumber?:string;jobId:string;jobNumber:string;date:string;customer:string;sender?:string;version?:number;amount:number|null;status?:string;error?:string;last_error?:string;
  source?:{places:number|null;weight:number|null;volume:number|null;chargeableWeight:number|null;transportNumber:string;orderNumber:string;mode:string};
  numberSync?:{state:string;last_error?:string}};
const labels: Record<string,string> = {not_issued:'Не выставлен',sending:'Отправляется / требуется сверка',transmitted:'Передано в 1С',manual:'Не передано в 1С — требуется ручное выставление',issued:'Выставлен',uncertain:'Передача в 1С не подтверждена — требуется сверка'};
export function PickupBillingTab({city,date,call,jobs}: {city:keyof typeof cities;date:string;jobs:Job[];routes:Route[];call:PickupCall}) {
  const [rows,setRows]=useState<Row[]>([]),[drafts,setDrafts]=useState<BillingDrafts>({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[search,setSearch]=useState('');
  const running=useRef(false);
  const generation=useRef(0);
  const load=useCallback(async(savedId?:string)=>{
    const ticket=++generation.current;
    const result=await call<{rows:Row[]}>({action:'billing_journal',city,date});
    if(ticket!==generation.current) return;
    setRows(result.rows);
    if(savedId) setDrafts(previous=>{const next={...previous};delete next[savedId];return next;});
  },[call,city,date]);
  useEffect(()=>{setRows([]);setDrafts({});setMessage('');setBusy(true);void load().catch(e=>setMessage(e.message)).finally(()=>setBusy(false));return()=>{generation.current++;};},[load]);
  const run=async(action:()=>Promise<void|false>,savedId?:string)=>{
    if(running.current) return;
    running.current=true;setBusy(true);setMessage('');
    try{if(await action()!==false) await load(savedId);}
    catch(e){setMessage((e as Error).message);}
    finally{running.current=false;setBusy(false);}
  };
  const save=async(row:Row)=>{
    const draft=drafts[row.jobId];
    if(billingDraftConflicts(row,draft)) throw new Error(`Забор ${row.jobNumber}: данные изменились. Сначала сравните суммы.`);
    const value=(draft?.value??billingAmountText(row)).trim().replace(',','.');
    if(!value || !Number.isFinite(Number(value)) || Number(value)<0) throw new Error(`Забор ${row.jobNumber}: введите сумму`);
    const saved=await call<{ok:boolean;version?:number}>({action:'billing_save',id:row.jobId,version:row.version,amount:Number(value)});
    if(!saved.ok || !Number.isInteger(saved.version)) throw new Error('Сумма не передана: обновите API и откройте журнал заново.');
    setMessage('Передаём стоимость в 1С…');
    try {
      const result=await call<{ok:boolean;error?:string;uncertain?:boolean;status?:string}>({action:'billing_send',id:row.jobId,version:saved.version,confirmed:true});
      setMessage(result.ok ? `Забор ${row.jobNumber}: стоимость передана в 1С для выставления счёта.`
        : `${row.jobNumber}: ${result.uncertain || result.status==='uncertain' ? 'Результат неизвестен — сверьте данные в 1С' : 'Не передано — требуется ручное выставление'}. ${result.error || ''}`);
    } catch(e) {
      setMessage(`${row.jobNumber}: передача не подтверждена — сверьте данные в 1С. ${(e as Error).message}`);
    }
  };
  const senderName=(row:Row)=>row.sender || jobs.find(job=>job.id===row.jobId)?.data.senderName || "";
  const filtered=rows.filter(r=>`${r.jobNumber} ${r.customer} ${senderName(r)} ${r.source?.transportNumber} ${r.orderNumber || r.source?.orderNumber || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="pk-panel pk-billing" aria-busy={busy}>
    <h2>Выставление счетов · {date} · {cities[city]}</h2>
    <div className="pk-actions">
      <label>Поиск <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Заказчик, отправитель, забор, перевозка, заявка" /></label>
    </div>
    {message&&<p role="status" style={{whiteSpace:'pre-wrap'}}>{message}</p>}
    {Object.entries(drafts).filter(([id])=>!rows.some(row=>row.jobId===id)).map(([id,draft])=><p role="alert" key={id}>Строка больше не доступна в журнале. Несохранённая сумма: {draft.value} ₽. Обновите список или проверьте забор.</p>)}
    {rows.length>0&&!filtered.length&&<p className="pk-empty" role="status">По запросу «{search}» ничего не найдено. <button onClick={()=>setSearch('')}>Очистить поиск</button></p>}
    {!rows.length&&!busy?<p className="pk-empty">Нет сданных на склад заборов с включённым выставлением счёта за этот день.</p>:<div className="pk-billing-table-wrap"><table className="pk-billing-table"><thead><tr>
      {['Дата','Заказчик','Отправитель','Места','Вес, кг','Объём, м³','Платный вес, кг','№ забора','№ перевозки','№ заявки','Сумма, ₽','Статус','Действие'].map(t=><th key={t}>{t}</th>)}
    </tr></thead><tbody>{filtered.map(row=><tr key={row.jobId}>
      <td data-label="Дата">{row.date}</td><td data-label="Заказчик">{row.customer}</td><td data-label="Отправитель">{senderName(row) || "—"}</td><td data-label="Места">{row.source?.places??'—'}</td><td data-label="Вес, кг">{row.source?.weight??'—'}</td><td data-label="Объём, м³">{row.source?.volume??'—'}</td><td data-label="Платный вес, кг">{row.source?.chargeableWeight??'—'}</td>
      <td data-label="№ забора"><strong>{row.jobNumber}</strong>{row.numberSync?.state==='error'&&<small title={row.numberSync.last_error}> · номер не передан в 1С</small>}</td>
      <td data-label="№ перевозки">{row.source?.transportNumber||'—'}</td><td data-label="№ заявки">{row.orderNumber||row.source?.orderNumber||'—'}</td>
      <td data-label="Сумма, ₽"><input aria-label={`Сумма ${row.jobNumber}`} inputMode="decimal" style={{width:110}} value={drafts[row.jobId]?.value??billingAmountText(row)} placeholder={row.source?.mode==='manual'?'Ввести сумму':'Нет расчёта'} disabled={busy||row.status!=='not_issued'} onChange={e=>setDrafts(old=>editBillingAmount(old,row,e.target.value))}/>
        {billingDraftConflicts(row,drafts[row.jobId])&&<div role="alert">Данные изменились. В БД: {row.amount??'—'} ₽. Ваш ввод сохранён.
          <button disabled={busy} onClick={()=>setDrafts(previous=>{const next={...previous};delete next[row.jobId];return next;})}>Принять сумму из БД</button>
          <button disabled={busy} onClick={()=>setDrafts(previous=>({...previous,[row.jobId]:{...previous[row.jobId],baseVersion:row.version}}))}>Оставить мой ввод</button>
        </div>}
      </td>
      <td data-label="Статус"><strong style={{color:['issued','transmitted'].includes(row.status||'')?'var(--pk-success-text)':['manual','uncertain'].includes(row.status||'')?'var(--pk-warning-text)':'inherit'}}>{labels[row.status||'']||'Нет данных'}</strong>{(row.error||row.last_error)&&<small style={{display:'block'}}>{row.error||row.last_error}</small>}</td>
      <td data-label="Действие">{row.status==='not_issued'&&<button disabled={busy||billingDraftConflicts(row,drafts[row.jobId])} onClick={()=>void run(()=>save(row),row.jobId)}>Выставить счёт</button>}
      {['manual','uncertain','sending'].includes(row.status||'')&&<button disabled={busy} onClick={()=>{if(window.confirm(`Подтвердить: счёт по забору ${row.jobNumber} действительно выставлен в 1С?`))void run(async()=>{await call({action:'billing_mark_issued',id:row.jobId,version:row.version});});}}>Подтвердить ручное выставление</button>}</td>
    </tr>)}</tbody></table></div>}
  </section>;
}
