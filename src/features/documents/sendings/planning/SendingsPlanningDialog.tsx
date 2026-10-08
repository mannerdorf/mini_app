import React,{useEffect,useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,ChevronDown,ChevronUp,Plus,RefreshCw,Table2,X} from 'lucide-react';
import {GuardedDialog} from '../../../../components/GuardedDialog';
import type {DocumentsAuth} from '../../../../api/client/documentsAuth';
import {fetchSendingPlanning,saveSendingPlanning,deleteSendingPlanning} from '../../../../api/client/sendingsPlanning';
import {VEHICLES} from '../../../tms/model';
import {calendarDays,DEFAULT_ROUTES,localDateKey,MODE_LABELS,missingPlanFields,needsFerry,planProgress,vehicleName,type PlanDraft,type PlanningData,type PlanningView,type SendingPlan} from './planningModel';
import {PlanningEditor} from './PlanningEditor';
import {PlanningCargoTable} from './PlanningCargoTable';
import './sending-planning.css';

const readableDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU');
function Execution({plan}:{plan:SendingPlan}) {
 const {planned,actual,percent}=planProgress(plan);
 return <span className="sending-planning__execution"><span>{planned?`${percent}% · факт ${actual} / план ${planned}`:'Перевозки не добавлены'}</span>{planned>0&&<span role="progressbar" aria-label="Исполнение плана" aria-valuemin={0} aria-valuemax={planned} aria-valuenow={actual} aria-valuetext={`${percent}%, отправлено ${actual} из ${planned}`}><i style={{width:`${percent}%`}}/></span>}</span>;
}
export function SendingsPlanningDialog({auth,onClose}:{auth:DocumentsAuth;onClose:()=>void}) {
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [data,setData]=useState<PlanningData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const [editor,setEditor]=useState<{draft:PlanDraft;initial:PlanDraft;plan?:SendingPlan}|null>(null),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState<'calendar'|'table'>('calendar'),[view,setView]=useState<PlanningView>('cargo'),[expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 const days=useMemo(()=>calendarDays(month),[month]),from=localDateKey(days[0]),to=localDateKey(days.at(-1)!);
 const dirty=!!editor&&JSON.stringify(editor.draft)!==JSON.stringify(editor.initial);
 useEffect(()=>{setEditor(null);setNotice('');},[auth.login,auth.password]);
 useEffect(()=>{
  if(editor||busy)return;
  const timer=setInterval(()=>{if(!document.hidden)setRefresh(value=>value+1);},60000);
  return()=>clearInterval(timer);
 },[!!editor,busy]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setData(null);
  fetchSendingPlanning(auth,from,to,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Не удалось загрузить планирование');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[auth.login,auth.password,from,to,refresh]);
 const routes=useMemo(()=>[...new Set([...DEFAULT_ROUTES,...(data?.available||[]).map(cargo=>cargo.route),...(data?.plans||[]).map(plan=>plan.route)])].filter(route=>route&&!route.includes('?')).sort(),[data]);
 const dismissEditor=()=>{if(busy)return;if(!dirty||window.confirm('Закрыть форму без сохранения изменений?'))setEditor(null);};
 const close=()=>{if(busy)return;if(!dirty||window.confirm('Закрыть форму без сохранения изменений?'))onClose();};
 const reload=()=>{if(busy)return;if(dirty&&!window.confirm('Обновить календарь без сохранения изменений?'))return;setEditor(null);setRefresh(value=>value+1);};
 const edit=(date:string,plan?:SendingPlan)=>{
  if(busy)return;if(dirty&&!window.confirm('Перейти к другому плану без сохранения изменений?'))return;
  const draft:PlanDraft=plan?{id:plan.id,revision:plan.revision,title:plan.title,isDraft:plan.isDraft,date:plan.date,route:plan.route,mode:plan.mode,vehicleId:plan.vehicleId,ferryId:plan.ferryId,comment:plan.comment,cargoNumbers:plan.cargo.map(cargo=>cargo.number)}:{date,route:DEFAULT_ROUTES[0],mode:'auto',vehicleId:VEHICLES[0].id,ferryId:null,comment:'',cargoNumbers:[]};
  setEditor({draft,initial:structuredClone(draft),plan});setError('');setNotice('');
 };
 const save=async()=>{
  if(!editor||busy)return;setBusy(true);setError('');
  try{await saveSendingPlanning(auth,editor.draft);setMonth(new Date(`${editor.draft.date.slice(0,7)}-01T12:00:00`));setEditor(null);setNotice('План сохранён');setRefresh(value=>value+1);}
  catch(reason){setError(reason instanceof Error?reason.message:'Не удалось сохранить план');}finally{setBusy(false);}
 };
 const remove=async()=>{
  if(!editor?.plan||busy||!window.confirm('Удалить план и освободить закреплённые перевозки?'))return;
  setBusy(true);setError('');
  try{await deleteSendingPlanning(auth,editor.plan.id,editor.plan.revision);setEditor(null);setNotice('План удалён');setRefresh(value=>value+1);}
  catch(reason){setError(reason instanceof Error?reason.message:'Не удалось удалить план');}finally{setBusy(false);}
 };
 const navigate=(offset:number)=>{if(busy)return;if(dirty&&!window.confirm('Сменить месяц без сохранения изменений?'))return;setEditor(null);setMonth(previous=>new Date(previous.getFullYear(),previous.getMonth()+offset,1));};
 const today=localDateKey(new Date());
 return <GuardedDialog title="Планирование отправок" onClose={close} className="sending-planning">
  <header className="sending-planning__header"><div><h2>Планирование</h2><p>Рекомендательные отправки для кладовщика</p></div><button type="button" className="sending-planning__icon" aria-label="Закрыть планирование" disabled={busy} onClick={close}><X size={22}/></button></header>
  <div className="sending-planning__toolbar"><div className="sending-planning__tabs"><button type="button" aria-pressed={tab==='calendar'} onClick={()=>setTab('calendar')}><CalendarDays size={16}/> Календарь</button><button type="button" aria-pressed={tab==='table'} onClick={()=>setTab('table')}><Table2 size={16}/> Таблица</button></div><span className="sending-planning__toolbar-spacer"/>
   <button type="button" className="sending-planning__icon" aria-label="Обновить планирование" disabled={loading||busy} onClick={reload}><RefreshCw size={18}/></button><button type="button" className="button-primary" disabled={!data||busy} onClick={()=>edit(today)}><Plus size={16}/> Новый план</button>
  </div>
  <div className="sending-planning__month"><h3>{month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</h3><div><button type="button" className="sending-planning__icon" aria-label="Предыдущий месяц" disabled={busy} onClick={()=>navigate(-1)}><ChevronLeft size={20}/></button><button type="button" className="filter-button" disabled={busy} onClick={()=>{if(dirty&&!window.confirm('Вернуться к текущему месяцу без сохранения изменений?'))return;setEditor(null);setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1));}}>Сегодня</button><button type="button" className="sending-planning__icon" aria-label="Следующий месяц" disabled={busy} onClick={()=>navigate(1)}><ChevronRight size={20}/></button></div></div>
  {loading&&<p role="status" className="sending-planning__muted">Загружаем планы и свободные перевозки…</p>}
  {error&&<p role="alert" className="sending-planning__error">{error}{!data&&!loading&&<button type="button" className="filter-button" onClick={()=>setRefresh(value=>value+1)}>Повторить</button>}</p>}
  {notice&&<p role="status" className="sending-planning__notice">{notice}</p>}
  <div className={`sending-planning__body${editor?' sending-planning__body--editing':''}`}>
   <section className="sending-planning__overview" aria-label={tab==='calendar'?'Календарь планирования':'Таблица планирования'}>
    {tab==='calendar'?<div className="sending-planning__calendar-scroll"><div className="sending-planning__calendar">
     {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=><div className="sending-planning__weekday" key={day}>{day}</div>)}
     {days.map(day=>{const date=localDateKey(day),plans=data?.plans.filter(plan=>plan.date===date)||[];return <div key={date} className={`sending-planning__day${day.getMonth()!==month.getMonth()?' is-outside':''}${date===today?' is-today':''}${date===editor?.draft.date?' is-selected':''}`} onClick={event=>{if(event.target===event.currentTarget&&data&&!busy)edit(date);}}>
      <button type="button" className="sending-planning__date" aria-label={`Запланировать отправку на ${readableDate(date)}`} disabled={!data||busy} onClick={()=>edit(date)}><span>{day.getDate()}</span><Plus size={13}/></button>
      {plans.map(plan=><button type="button" key={plan.id} className={`sending-planning__event sending-planning__event--${plan.mode||'draft'}`} disabled={busy} onClick={()=>edit(date,plan)} aria-label={`План ${readableDate(date)}, ${plan.title||plan.route}, ${MODE_LABELS[plan.mode]}`}><b>{plan.title||plan.route}</b>{plan.title&&plan.route&&<small>{plan.route}</small>}<span>{MODE_LABELS[plan.mode]} · {needsFerry(plan.mode)||!plan.mode?plan.ferryName||'Паром не выбран':plan.mode==='auto'?vehicleName(plan.vehicleId):'Авиаперевозка'}</span>{needsFerry(plan.mode)&&<small>{vehicleName(plan.vehicleId)}</small>}{plan.isDraft&&<small className="sending-planning__draft-status">Черновик · нужно заполнить</small>}<Execution plan={plan}/></button>)}
     </div>;})}
    </div></div>:<>
     <div className="sending-planning__tabs sending-planning__group-tabs">{(['cargo','customer','receiver'] as const).map(key=><button type="button" key={key} aria-pressed={view===key} onClick={()=>{setView(key);setExpanded(new Set(data?.plans.map(plan=>plan.id)||[]));}}>{key==='cargo'?'По перевозкам':key==='customer'?'По заказчикам':'По получателям'}</button>)}</div>
     <div className="sending-planning__table-scroll"><table className="sending-planning__plans-table"><thead><tr><th>Дата</th><th>Маршрут</th><th>Тип / ТС</th><th>Паром</th><th>Исполнение</th><th>Комментарий</th><th/></tr></thead><tbody>{data?.plans.map(plan=><React.Fragment key={plan.id}><tr><td><button type="button" className="sending-planning__link" disabled={busy} onClick={()=>edit(plan.date,plan)}>{readableDate(plan.date)}</button></td><td>{plan.title&&<b>{plan.title}</b>}{plan.title?<small>{plan.route||'Маршрут не указан'}</small>:plan.route}{plan.isDraft&&<small className="sending-planning__draft-status">Черновик · нужно заполнить</small>}</td><td>{MODE_LABELS[plan.mode]}{plan.mode!=='air'&&<small>{vehicleName(plan.vehicleId)}</small>}</td><td>{plan.ferryName||'—'}</td><td><Execution plan={plan}/></td><td className="sending-planning__comment">{plan.comment||'—'}</td><td><button type="button" className="sending-planning__icon" aria-label={`Состав плана на ${readableDate(plan.date)}`} aria-expanded={expanded.has(plan.id)} onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(next.has(plan.id))next.delete(plan.id);else next.add(plan.id);return next;})}>{expanded.has(plan.id)?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button></td></tr>{expanded.has(plan.id)&&<tr><td colSpan={7}><PlanningCargoTable plan={plan} view={view}/></td></tr>}</React.Fragment>)}</tbody></table>{data&&!data.plans.length&&<p className="sending-planning__muted">За этот период ещё нет планов</p>}</div>
    </>}
   </section>
   {editor&&<PlanningEditor key={editor.plan?.id||'new'} draft={editor.draft} plan={editor.plan} available={data?.available||[]} ferries={data?.ferries||[]} routes={routes} busy={busy} onChange={draft=>setEditor(previous=>previous?{...previous,draft:{...draft,isDraft:!!previous.plan?.isDraft&&missingPlanFields(draft).length>0}}:null)} onSave={()=>void save()} onCancel={dismissEditor} onDelete={editor.plan?()=>void remove():undefined}/>}
  </div>
  {data&&<p className="sending-planning__footnote">Свободных перевозок: {data.available.length} · Исполнение рассчитано по перевозкам, включённым в фактические отправки 1С</p>}
 </GuardedDialog>;
}
