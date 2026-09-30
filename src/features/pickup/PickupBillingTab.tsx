import { formatCurrency } from "../../lib/formatUtils";
import { ArrowDown, ArrowUp, Calculator } from 'lucide-react';
import { ClickableInvoiceNumber } from '../../components/ui/EntityLinks';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, Route } from '../../../lib/pickup/model';
import { cities } from '../../../lib/pickup/model';
import type { PickupCall } from './client';
import { billingAmountText, billingDraftConflicts, editBillingAmount, type BillingDrafts } from './billingDrafts';

type TransportCandidate = {number:string;orderNumber:string;date:string;sender:string;receiver:string;places:number|null;weight:number|null;volume:number|null};
type Row = {invoiceReferenceDate?:string;invoiceNumber?:string;orderNumber?:string;jobId:string;jobNumber:string;date:string;customer:string;sender?:string;version?:number;amount:number|null;status?:string;error?:string;last_error?:string;
  source?:{places:number|null;weight:number|null;volume:number|null;chargeableWeight:number|null;transportNumber:string;orderNumber:string;mode:string};
  numberSync?:{state:string;last_error?:string}};
const labels: Record<string,string> = {not_issued:'Не выставлен',sending:'Отправляется / требуется сверка',transmitted:'Стоимость передана — ожидается счёт',manual:'Не передано в 1С — требуется ручное выставление',issued:'Выставление подтверждено вручную — счёт не найден',uncertain:'Передача в 1С не подтверждена — требуется сверка'};
const isManualCalculationPending = (row: Row) => row.status === 'not_issued' && row.source?.mode === 'manual';
const missingTransport = (row: Row) => row.error?.startsWith('Перевозка не найдена:') === true;
const billingExplanation = (row: Row) => missingTransport(row)
  ? `Груз сдан, ${row.orderNumber || row.source?.orderNumber ? 'заявка есть, ' : ''}перевозка ещё не найдена в данных 1С.`
  : row.error;
export function PickupBillingTab({city,date,dateTo=date,call,jobs,onCount,onOpenInvoice}: {city:keyof typeof cities;date:string;dateTo?:string;onCount?:(count:number)=>void;onOpenInvoice?:(invoice:Record<string,unknown>)=>void;jobs:Job[];routes:Route[];call:PickupCall}) {
  const [transportMatch,setTransportMatch]=useState<{row:Row;version:number;transports:TransportCandidate[]}|null>(null);
  const transportPanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(transportMatch)transportPanel.current?.scrollIntoView?.({behavior:'smooth',block:'center'});},[transportMatch]);
  const [transportSearch,setTransportSearch]=useState('');
  const [transportChoice,setTransportChoice]=useState('');
  const [matching,setMatching]=useState<{row:Row;invoices:{number:string;date:string;description:string}[]}|null>(null);
  const [invoiceChoice,setInvoiceChoice]=useState('');
  const matchingPanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(matching)matchingPanel.current?.scrollIntoView?.({behavior:'smooth',block:'center'});},[matching]);
  useEffect(()=>{setMatching(null);setTransportMatch(null);},[city,date,dateTo]);
  const [rows,setRows]=useState<Row[]>([]),[drafts,setDrafts]=useState<BillingDrafts>({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [editingAmount,setEditingAmount]=useState<string|null>(null);
  const [sort,setSort]=useState<{column:number;direction:1|-1}>({column:0,direction:-1});
  const running=useRef(false);
  const generation=useRef(0);
  const load=useCallback(async(savedId?:string)=>{
    const ticket=++generation.current;
    const result=await call<{rows:Row[]}>({action:'billing_journal',city,date,dateTo});
    if(ticket!==generation.current) return;
    setRows(result.rows);
    onCount?.(result.rows.length);
    if(savedId) setDrafts(previous=>{const next={...previous};delete next[savedId];return next;});
  },[call,city,date,dateTo,onCount]);
  useEffect(()=>{setRows([]);setDrafts({});setEditingAmount(null);setMessage('');setBusy(true);void load().catch(e=>setMessage(e.message)).finally(()=>setBusy(false));return()=>{generation.current++;};},[load]);
  const run=async(action:()=>Promise<void|false>,savedId?:string)=>{
    if(running.current) return;
    running.current=true;setBusy(true);setMessage('');
    try{if(await action()!==false) await load(savedId);}
    catch(e){setMessage((e as Error).message);}
    finally{running.current=false;setBusy(false);}
  };
  const calculate=async(row:Row)=>{
    if(running.current) return;
    const ticket=generation.current;
    running.current=true;setBusy(true);setMessage('');
    try {
      const result=await call<{amount:number}>({action:'billing_quote',id:row.jobId,version:row.version});
      if(ticket!==generation.current) return;
      if(!Number.isFinite(result.amount)||result.amount<0) throw new Error('Калькулятор вернул некорректную сумму');
      setDrafts(old=>editBillingAmount(old,row,String(Math.round(result.amount))));
      setEditingAmount(row.jobId);
    } catch(e) {if(ticket===generation.current) setMessage((e as Error).message);}
    finally {running.current=false;if(ticket===generation.current)setBusy(false);}
  };
  const save=async(row:Row)=>{
    const draft=drafts[row.jobId];
    if(billingDraftConflicts(row,draft)) throw new Error(`Забор ${row.jobNumber}: данные изменились. Сначала сравните суммы.`);
    const value=(draft?.value??billingAmountText(row)).trim().replace(',','.');
    if(!value || !Number.isFinite(Number(value)) || Number(value)<=0) throw new Error(`Забор ${row.jobNumber}: введите сумму`);
    const saved=await call<{ok:boolean;version?:number}>({action:'billing_save',id:row.jobId,version:row.version,amount:Number(value)});
    if(!saved.ok || !Number.isInteger(saved.version)) throw new Error('Сумма не передана: обновите API и откройте журнал заново.');
    setMessage('Создаём счёт в 1С…');
    try {
      const result=await call<{ok:boolean;error?:string;uncertain?:boolean;status?:string;invoiceNumber?:string}>({action:'billing_send',id:row.jobId,version:saved.version,confirmed:true,createInvoice:true});
      setMessage(result.ok && result.invoiceNumber ? `Забор ${row.jobNumber}: счёт № ${result.invoiceNumber} создан в 1С.`
        : `${row.jobNumber}: ${result.uncertain || result.status==='uncertain' ? 'Результат неизвестен — сверьте данные в 1С' : 'Не передано — требуется ручное выставление'}. ${result.error || ''}`);
    } catch(e) {
      setMessage(`${row.jobNumber}: передача не подтверждена — сверьте данные в 1С. ${(e as Error).message}`);
    }
  };
  const findTransport=async(row:Row,search='')=>{
    const result=await call<{version:number;transports:TransportCandidate[]}>({action:'billing_transport_candidates',id:row.jobId,search});
    setTransportMatch({row,...result});setTransportSearch(search);setTransportChoice('');return false as const;
  };
  const retry=async(row:Row)=>{
    const result=await call<{ok:boolean;error?:string;invoiceNumber?:string}>({action:'billing_send',id:row.jobId,version:row.version,confirmed:true,retry:true,createInvoice:true});
    setMessage(result.ok && result.invoiceNumber ? `Забор ${row.jobNumber}: счёт № ${result.invoiceNumber} создан в 1С.` : `${row.jobNumber}: ${result.error || 'Передача не подтверждена — сверьте данные в 1С.'}`);
  };
  const senderName=(row:Row)=>row.sender || jobs.find(job=>job.id===row.jobId)?.data.senderName || "";
  const sortValue=(row:Row,column:number):string|number|null|undefined=>{
    switch(column) {
      case 0:return row.date;
      case 1:return row.customer;
      case 2:return senderName(row);
      case 3:return row.source?.places;
      case 4:return row.source?.weight;
      case 5:return row.source?.volume;
      case 6:return row.source?.chargeableWeight;
      case 7:return row.jobNumber;
      case 8:return row.source?.transportNumber;
      case 9:return row.orderNumber||row.source?.orderNumber;
      case 10:return row.amount;
      case 11:return isManualCalculationPending(row)?'Не выставлен — ручной расчёт':row.invoiceNumber?`Счёт № ${row.invoiceNumber}`:labels[row.status||'']||'Нет данных';
    }
  };
  const sortedRows=[...rows].sort((a,b)=>{
    const left=sortValue(a,sort.column),right=sortValue(b,sort.column);
    const leftEmpty=left==null||left==='',rightEmpty=right==null||right==='';
    if(leftEmpty||rightEmpty)return leftEmpty===rightEmpty?0:leftEmpty?1:-1;
    const comparison=typeof left==='number'&&typeof right==='number'?left-right:String(left).localeCompare(String(right),'ru',{numeric:true,sensitivity:'base'});
    return comparison*sort.direction;
  });
  return <section className="pk-panel pk-billing" aria-busy={busy}>
    <p>В автоматическом режиме рассчитанная стоимость передаётся в 1С после сдачи на склад. Очередь проверяется каждые 5 минут.</p>
    <div className="pk-actions">
      <button disabled={busy} onClick={()=>void run(async()=>{})}>Обновить статусы</button>
    </div>
    {message&&<p role="status" style={{whiteSpace:'pre-wrap'}}>{message}</p>}
    {Object.entries(drafts).filter(([id])=>!rows.some(row=>row.jobId===id)).map(([id,draft])=><p role="alert" key={id}>Строка больше не доступна в журнале. Несохранённая сумма: {draft.value} ₽. Обновите список или проверьте забор.</p>)}
    {!rows.length&&!busy?<p className="pk-empty">Нет сданных на склад заборов с включённым выставлением счёта за этот день.</p>:<div className="pk-billing-table-wrap"><table className="pk-billing-table"><thead><tr>
      {['Дата','Заказчик','Отправитель','Места','Вес, кг','Объём, м³','Платный вес, кг','№ забора','№ перевозки','№ заявки','Сумма, ₽','Статус','Действие'].map((t,column)=><th key={t} scope="col" aria-sort={column===12?undefined:sort.column===column?(sort.direction===1?'ascending':'descending'):'none'}>{column===12?t:<button type="button" className="pk-billing-sort" aria-label={`Сортировать: ${t}`} onClick={()=>setSort(previous=>({column,direction:previous.column===column?(previous.direction===1?-1:1):1}))}>{t}{sort.column===column&&(sort.direction===1?<ArrowUp size={12} aria-hidden="true"/>:<ArrowDown size={12} aria-hidden="true"/>)}</button>}</th>)}
    </tr></thead><tbody>{sortedRows.map(row=><tr key={row.jobId}>
      <td data-label="Дата"><time dateTime={row.date} title={row.date}>{/^\d{4}-\d{2}-\d{2}$/.test(row.date)?`${row.date.slice(8,10)}.${row.date.slice(5,7)}`:row.date}</time></td><td data-label="Заказчик">{row.customer}</td><td data-label="Отправитель">{senderName(row) || "—"}</td><td data-label="Места">{row.source?.places??'—'}</td><td data-label="Вес, кг">{row.source?.weight??'—'}</td><td data-label="Объём, м³">{row.source?.volume??'—'}</td><td data-label="Платный вес, кг">{row.source?.chargeableWeight??'—'}</td>
      <td data-label="№ забора"><strong>{row.jobNumber}</strong>{row.numberSync?.state==='error'&&<small title={row.numberSync.last_error}> · номер не передан в 1С</small>}</td>
      <td data-label="№ перевозки">{row.source?.transportNumber||'—'}</td><td data-label="№ заявки">{row.orderNumber||row.source?.orderNumber||'—'}</td>
      <td data-label="Сумма, ₽"><div className="pk-billing-amount">{row.status!=='not_issued'?<span className="pk-billing-amount-value">{row.amount==null?(missingTransport(row)?'Нет данных':'—'):formatCurrency(row.amount,true)}</span>:((drafts[row.jobId]?.value??billingAmountText(row)).trim()!==''&&editingAmount!==row.jobId)?<button type="button" className="pk-billing-amount-edit" aria-label={`Изменить сумму ${row.jobNumber}`} title="Изменить сумму" disabled={busy} onClick={()=>setEditingAmount(row.jobId)}>{formatCurrency(Number((drafts[row.jobId]?.value??billingAmountText(row)).replace(',','.')),true)}</button>:<input autoFocus={editingAmount===row.jobId} onFocus={()=>setEditingAmount(row.jobId)} onBlur={()=>setEditingAmount(null)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} aria-label={`Сумма ${row.jobNumber}`} inputMode="decimal" style={{width:110}} value={drafts[row.jobId]?.value??billingAmountText(row)} placeholder={missingTransport(row)?'Нет данных':row.source?.mode==='manual'?'Ввести сумму':'Нет расчёта'} disabled={busy||row.status!=='not_issued'} onChange={e=>setDrafts(old=>editBillingAmount(old,row,e.target.value))}/>}{row.status==='not_issued'&&<button type="button" className="pk-billing-calculate" title="Рассчитать стоимость забора" aria-label={`Рассчитать сумму ${row.jobNumber}`} disabled={busy||billingDraftConflicts(row,drafts[row.jobId])} onClick={()=>void calculate(row)}><Calculator size={16}/></button>}</div>
        {billingDraftConflicts(row,drafts[row.jobId])&&<div role="alert">Данные изменились. В БД: {row.amount??'—'} ₽. Ваш ввод сохранён.
          <button disabled={busy} onClick={()=>setDrafts(previous=>{const next={...previous};delete next[row.jobId];return next;})}>Принять сумму из БД</button>
          <button disabled={busy} onClick={()=>setDrafts(previous=>({...previous,[row.jobId]:{...previous[row.jobId],baseVersion:row.version}}))}>Оставить мой ввод</button>
        </div>}
      </td>
      <td data-label="Статус"><strong style={{color:isManualCalculationPending(row)?'var(--pk-warning-text)':row.invoiceNumber?'var(--pk-success-text)':['manual','uncertain','transmitted','issued'].includes(row.status||'')?'var(--pk-warning-text)':'inherit'}}>{isManualCalculationPending(row) ? 'Не выставлен — ручной расчёт' : row.invoiceNumber ? <>Счёт № <ClickableInvoiceNumber number={row.invoiceNumber} invoice={{Number:row.invoiceNumber,Customer:row.customer,_invoiceReferenceDate:row.invoiceReferenceDate || row.date}} onOpen={onOpenInvoice} style={{color:'inherit',fontWeight:'inherit'}} /></> : labels[row.status||'']||'Нет данных'}</strong>{row.status==='transmitted'&&!row.invoiceNumber&&<small style={{display:'block'}}>Номер счёта ещё не получен из 1С.</small>}{!row.error&&row.last_error&&['manual','uncertain'].includes(row.status||'')&&<small style={{display:'block'}}>{row.last_error}</small>}{row.error&&<small style={{display:'block'}}>{billingExplanation(row)}</small>}</td>
      <td data-label="Действие">{(!row.source?.transportNumber||missingTransport(row))&&<button disabled={busy} onClick={()=>void run(()=>findTransport(row))}>Сопоставить перевозку</button>}{!row.invoiceNumber&&<button disabled={busy} onClick={()=>void run(async()=>{
        const result=await call<{invoices:{number:string;date:string;description:string}[]}>({action:'billing_invoice_candidates',id:row.jobId});
        setMatching({row,invoices:result.invoices});setInvoiceChoice('');return false;
      })}>Сопоставить счёт</button>}{row.status==='not_issued'&&<button disabled={busy||billingDraftConflicts(row,drafts[row.jobId])} onClick={()=>void run(()=>save(row),row.jobId)}>Выставить счёт</button>}
      {['manual','uncertain'].includes(row.status||'')&&<button disabled={busy} onClick={()=>{if(row.status!=='uncertain'||window.confirm(`Предыдущая передача по забору ${row.jobNumber} могла выполниться. Проверьте наличие счёта в 1С. Повторить запрос создания счёта?`))void run(()=>retry(row));}}>Повторить передачу в 1С</button>}
      </td>
    </tr>)}</tbody></table></div>}
    {transportMatch&&<div ref={transportPanel} className="pk-card" role="dialog" aria-label="Сопоставить перевозку">
      <h3>Сопоставить перевозку · {transportMatch.row.jobNumber}</h3>
      <p>Перевозки этого заказчика из БД. При сопоставлении номер заявки будет взят из выбранной перевозки.</p>
      <input aria-label="Поиск перевозки" placeholder="Номер перевозки, заявки, отправитель или получатель" value={transportSearch} onChange={e=>setTransportSearch(e.target.value)} />
      <button disabled={busy} onClick={()=>void run(()=>findTransport(transportMatch.row,transportSearch))}>Найти</button>
      <label>Перевозка <select aria-label="Выбор перевозки" disabled={busy} value={transportChoice} onChange={e=>setTransportChoice(e.target.value)}>
        <option value="">Выберите перевозку</option>
        {transportMatch.transports.map((t,index)=><option key={`${t.number}:${index}`} value={String(index)}>№ {t.number} · {t.date.slice(0,10)} · {t.sender} → {t.receiver} · заявка {t.orderNumber||'—'}</option>)}
      </select></label>
      {!transportMatch.transports.length&&<p>Перевозки не найдены. Измените поиск или обновите журнал перевозок.</p>}
      {transportChoice!==''&&<p>Мест: {transportMatch.transports[Number(transportChoice)].places??'—'} · Вес: {transportMatch.transports[Number(transportChoice)].weight??'—'} кг · Объём: {transportMatch.transports[Number(transportChoice)].volume??'—'} м³</p>}
      <button disabled={busy||transportChoice===''} onClick={()=>void run(async()=>{
        await call({action:'billing_match_transport',id:transportMatch.row.jobId,jobVersion:transportMatch.version,transportNumber:transportMatch.transports[Number(transportChoice)].number});
        setTransportMatch(null);setMessage('Перевозка сопоставлена');
      })}>Сохранить сопоставление</button>
      <button disabled={busy} onClick={()=>setTransportMatch(null)}>Закрыть</button>
    </div>}
    {matching&&<div ref={matchingPanel} role="dialog" aria-modal="false" aria-label="Сопоставить счёт" className="pk-card">
      <h3>Сопоставить счёт · {matching.row.jobNumber}</h3>
      <p>Счета заказчика с услугой забора из журнала. Проверьте выбранный документ перед сопоставлением.</p>
      {matching.invoices.length ? <>
        <label>Счёт <select value={invoiceChoice} disabled={busy} onChange={e=>setInvoiceChoice(e.target.value)}>
          <option value="">Выберите счёт</option>
          {matching.invoices.map((invoice,index)=><option key={`${invoice.date}:${invoice.number}`} value={String(index)}>№ {invoice.number} от {invoice.date}</option>)}
        </select></label>
        {invoiceChoice!==''&&<p>{matching.invoices[Number(invoiceChoice)].description}</p>}
        {invoiceChoice!==''&&<button onClick={()=>{const invoice=matching.invoices[Number(invoiceChoice)];onOpenInvoice?.({Number:invoice.number,Customer:matching.row.customer,_invoiceReferenceDate:invoice.date});}}>Открыть счёт</button>}
        <button disabled={busy||invoiceChoice===''} onClick={()=>void run(async()=>{
          const invoice=matching.invoices[Number(invoiceChoice)];
          await call({action:'billing_match_invoice',id:matching.row.jobId,version:matching.row.version,invoiceNumber:invoice.number,invoiceDate:invoice.date});
          setMatching(null);setMessage('Счёт сопоставлен');
        })}>Сопоставить</button>
      </>:<p>Подходящих счетов в журнале нет. Нужен счёт этого заказчика с услугой забора.</p>}
      <button disabled={busy} onClick={()=>setMatching(null)}>Закрыть</button>
    </div>}
  </section>;
}
