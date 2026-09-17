import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, Route } from '../../../lib/pickup/model';
import { cities } from '../../../lib/pickup/model';
import type { PickupCall } from './client';

type Row = {jobId:string;jobNumber:string;date:string;customer:string;version?:number;amount:number|null;status?:string;error?:string;last_error?:string;
  source?:{places:number|null;weight:number|null;volume:number|null;chargeableWeight:number|null;transportNumber:string;orderNumber:string;mode:string};
  numberSync?:{state:string;last_error?:string}};
const labels: Record<string,string> = {not_issued:'Не выставлен',sending:'Отправляется / требуется сверка',transmitted:'Передано в 1С',manual:'Не передано в 1С — требуется ручное выставление',issued:'Выставлен',uncertain:'Передача в 1С не подтверждена — требуется сверка'};
export function PickupBillingTab({city,date,call}: {city:keyof typeof cities;date:string;jobs:Job[];routes:Route[];call:PickupCall}) {
  const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<Set<string>>(new Set()),[amounts,setAmounts]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[search,setSearch]=useState('');
  const generation=useRef(0);
  const load=useCallback(async()=>{
    const ticket=++generation.current;
    const result=await call<{rows:Row[]}>({action:'billing_journal',city,date});
    if(ticket!==generation.current) return;
    setRows(result.rows); setAmounts(Object.fromEntries(result.rows.map(r=>[r.jobId,r.amount==null?'':String(r.amount)]))); setSelected(new Set());
  },[call,city,date]);
  useEffect(()=>{setRows([]);setMessage('');setBusy(true);void load().catch(e=>setMessage(e.message)).finally(()=>setBusy(false));return()=>{generation.current++;};},[load]);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await action();await load();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
  const save=async(row:Row)=>{
    const value=amounts[row.jobId]?.trim().replace(',','.');
    if(!value || !Number.isFinite(Number(value)) || Number(value)<0) throw new Error(`Забор ${row.jobNumber}: введите сумму`);
    await call({action:'billing_save',id:row.jobId,version:row.version,amount:Number(value)});
  };
  const send=async()=>{
    const batch=rows.filter(r=>selected.has(r.jobId));
    const total=batch.reduce((sum,row)=>sum+(row.amount??0),0);
    if(!window.confirm(`Подтвердить передачу стоимости в 1С: ${batch.length} заборов, сумма ${total.toLocaleString('ru-RU')} ₽? После передачи счета будут выставлены автоматически в 1С.`)) return;
    let success=0;const failures:string[]=[];
    for(const row of batch) {
      try {
        if(String(row.amount??'')!==amounts[row.jobId]) throw new Error('Сначала сохраните изменённую сумму');
        const result=await call<{ok:boolean;error?:string}>({action:'billing_send',id:row.jobId,version:row.version,confirmed:true});
        if(result.ok) success++;else failures.push(`${row.jobNumber} / ${row.source?.transportNumber}: ${result.error}`);
      }catch(e){failures.push(`${row.jobNumber}: ${(e as Error).message}`);}
    }
    setMessage(`Передано в 1С: ${success}. ${failures.length ? `Не передано в 1С — требуется ручное выставление (при неизвестном результате сначала сверьте данные в 1С): ${failures.join('; ')}` : ''}`);
  };
  const filtered=rows.filter(r=>`${r.jobNumber} ${r.customer} ${r.source?.transportNumber} ${r.source?.orderNumber}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="pk-panel pk-billing" aria-busy={busy}>
    <h2>Выставление счетов · {date} · {cities[city]}</h2>
    <p className="pk-hint">Данные груза — из перевозки в БД. Диспетчер проверяет сумму и подтверждает передачу стоимости. После успешной передачи счета выставляются автоматически в 1С.</p>
    <div className="pk-actions">
      <label>Поиск <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Заказчик, забор, перевозка, заявка" /></label>
      <button disabled={busy} onClick={()=>void run(async()=>{})}>Обновить</button>
      <button disabled={busy||!selected.size} onClick={()=>void run(send)}>Передать стоимость в 1С ({selected.size})</button>
    </div>
    {message&&<p role="status" style={{whiteSpace:'pre-wrap'}}>{message}</p>}
    {!rows.length&&!busy?<p className="pk-empty">Нет сданных на склад заборов с включённым выставлением счёта за этот день.</p>:<div className="pk-billing-table-wrap"><table className="pk-billing-table"><thead><tr>
      <th><input type="checkbox" aria-label="Выбрать доступные строки" disabled={busy} checked={filtered.some(r=>r.status==='not_issued'&&r.amount!=null&&!r.error)&&filtered.filter(r=>r.status==='not_issued'&&r.amount!=null&&!r.error).every(r=>selected.has(r.jobId))}
        onChange={e=>setSelected(new Set(e.target.checked?filtered.filter(r=>r.status==='not_issued'&&r.amount!=null&&!r.error).map(r=>r.jobId):[]))}/></th>
      {['Дата','Заказчик','Места','Вес, кг','Объём, м³','Платный вес, кг','№ забора','№ перевозки','№ заявки','Сумма, ₽','Статус','Действие'].map(t=><th key={t}>{t}</th>)}
    </tr></thead><tbody>{filtered.map(row=><tr key={row.jobId}>
      <td><input type="checkbox" aria-label={`Выбрать ${row.jobNumber}`} checked={selected.has(row.jobId)} disabled={busy||row.status!=='not_issued'||row.amount==null||Boolean(row.error)} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(row.jobId);else next.delete(row.jobId);return next;})}/></td>
      <td>{row.date}</td><td>{row.customer}</td><td>{row.source?.places??'—'}</td><td>{row.source?.weight??'—'}</td><td>{row.source?.volume??'—'}</td><td>{row.source?.chargeableWeight??'—'}</td>
      <td><strong>{row.jobNumber}</strong>{row.numberSync?.state==='error'&&<small title={row.numberSync.last_error}> · номер не передан в 1С</small>}</td>
      <td>{row.source?.transportNumber||'—'}</td><td>{row.source?.orderNumber||'—'}</td>
      <td><input aria-label={`Сумма ${row.jobNumber}`} inputMode="decimal" style={{width:110}} value={amounts[row.jobId]??''} placeholder={row.source?.mode==='manual'?'Ввести сумму':'Нет расчёта'} disabled={busy||!['not_issued','manual'].includes(row.status||'')} onChange={e=>setAmounts(old=>({...old,[row.jobId]:e.target.value}))}/></td>
      <td><strong style={{color:['issued','transmitted'].includes(row.status||'')?'var(--success, #15803d)':['manual','uncertain'].includes(row.status||'')?'var(--warning, #92400e)':'inherit'}}>{labels[row.status||'']||'Нет данных'}</strong>{(row.error||row.last_error)&&<small style={{display:'block'}}>{row.error||row.last_error}</small>}</td>
      <td>{['not_issued','manual'].includes(row.status||'')&&<button disabled={busy} onClick={()=>void run(()=>save(row))}>Сохранить сумму</button>}
      {['manual','uncertain','sending'].includes(row.status||'')&&<button disabled={busy} onClick={()=>{if(window.confirm(`Подтвердить: счёт по забору ${row.jobNumber} действительно выставлен в 1С?`))void run(async()=>{await call({action:'billing_mark_issued',id:row.jobId,version:row.version});});}}>Подтвердить ручное выставление</button>}</td>
    </tr>)}</tbody></table></div>}
  </section>;
}
