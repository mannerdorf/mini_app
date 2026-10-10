import React,{useEffect,useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Table2,X} from 'lucide-react';
import {GuardedDialog} from '../../../../components/GuardedDialog';
import type {DocumentsAuth} from '../../../../api/client/documentsAuth';
import {fetchSendingPlanning,saveSendingPlanning,deleteSendingPlanning,reconcileSendingPlanning} from '../../../../api/client/sendingsPlanning';
import {VEHICLES,type TmsCargo} from '../../../tms/model';
import {calendarDays,calendarWeekDays,DEFAULT_ROUTES,localDateKey,MODE_LABELS,missingPlanFields,planningToday,planProgress,type PlanDraft,type PlanningData,type SendingPlan} from './planningModel';
import {PlanningEditor} from './PlanningEditor';
import {PlanningPlansTable} from './PlanningPlansTable';
import {PlanningCalendar} from './PlanningCalendar';
import {PlanningLayoutControls,usePlanningLayout} from './PlanningLayout';
import {PlanningForecastToggle,usePlanningForecast} from './PlanningForecastToggle';
import {PlanningToolbarTotals} from './PlanningToolbarTotals';
import {usePlanningEditors} from './usePlanningEditors';
import './sending-planning.css';

const readableDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU');
function Execution({plan}:{plan:SendingPlan}) {
 const {planned,actual,percent}=planProgress(plan);
 return <span className="sending-planning__execution"><span>{planned?`${percent}% · факт ${actual} / план ${planned}`:'Перевозки не добавлены'}</span>{planned>0&&<span role="progressbar" aria-label="Исполнение плана" aria-valuemin={0} aria-valuemax={planned} aria-valuenow={actual} aria-valuetext={`${percent}%, отправлено ${actual} из ${planned}`}><i style={{width:`${percent}%`}}/></span>}{plan.reconciliation&&<small>Освобождено: {plan.reconciliation.releasedCargoNumbers.length}</small>}{!plan.reconciliation&&(plan.factCandidates?.length||0)>1&&<small>Выберите фактическую отправку</small>}</span>;
}
export function SendingsPlanningDialog({auth,onClose}:{auth:DocumentsAuth;onClose:()=>void}) {
 const workspace=usePlanningLayout();
 const forecast=usePlanningForecast(auth.login);
 const [period,setPeriod]=useState<'month'|'week'>('month'),[weekDate,setWeekDate]=useState(()=>new Date());
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [data,setData]=useState<PlanningData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const {editor,setEditor,switchEditor,resetEditors,dirty,hasUnsavedChanges}=usePlanningEditors();
 const [busy,setBusy]=useState(false),[newEditorKey,setNewEditorKey]=useState(0);
 const [tab,setTab]=useState<'calendar'|'table'>('calendar'),[expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 const days=useMemo(()=>period==='month'?calendarDays(month):calendarWeekDays(weekDate),[month,weekDate,period]),from=localDateKey(days[0]),to=localDateKey(days.at(-1)!);
 useEffect(()=>{resetEditors();},[auth.login,auth.password,resetEditors]);
 useEffect(()=>{
  if(editor||busy||hasUnsavedChanges)return;
  const timer=setInterval(()=>{if(!document.hidden)setRefresh(value=>value+1);},60000);
  return()=>clearInterval(timer);
 },[!!editor,busy,hasUnsavedChanges]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setData(null);
  fetchSendingPlanning(auth,from,to,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Не удалось загрузить планирование');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[auth.login,auth.password,from,to,refresh]);
 const routes=useMemo(()=>[...new Set([...DEFAULT_ROUTES,...(data?.available||[]).map(cargo=>cargo.route),...(data?.plans||[]).map(plan=>plan.route)])].filter(route=>route&&!route.includes('?')).sort(),[data]);
 const summaryCargo=useMemo(()=>{
  if(!editor)return [];
  if(editor.plan?.reconciliation)return editor.plan.reconciliation.originalCargo;
  const byNumber=new Map([...(data?.available||[]),...(editor.plan?.cargo||[])].map(cargo=>[cargo.number,cargo]));
  return editor.draft.cargoNumbers.map(number=>byNumber.get(number)).filter((cargo):cargo is TmsCargo=>!!cargo);
 },[editor?.draft.cargoNumbers,editor?.plan,data?.available]);
 const dismissEditor=()=>{if(busy)return;if(!dirty||window.confirm('Закрыть форму без сохранения изменений?'))setEditor(null);};
 const close=()=>{if(busy)return;if(!hasUnsavedChanges||window.confirm('Закрыть планирование без сохранения изменений?'))onClose();};
 const edit=(date:string,plan?:SendingPlan,switchRow=false,initialRoute?:string)=>{
  if(!plan&&date<planningToday())return;
  if(busy||plan&&editor?.plan?.id===plan.id)return;
  const preserveCurrent=switchRow&&!!editor?.plan;
  if(dirty&&!preserveCurrent&&!window.confirm('Перейти к другому плану без сохранения изменений?'))return;
  const draft:PlanDraft=plan?{id:plan.id,revision:plan.revision,title:plan.title,isDraft:plan.isDraft,date:plan.date,route:plan.route,mode:plan.mode,vehicleId:plan.vehicleId,ferryId:plan.ferryId,departureDate:plan.departureDate||'',vehicleDimensions:plan.vehicleDimensions||null,comment:plan.comment,cargoNumbers:plan.cargo.map(cargo=>cargo.number)}:{date,route:initialRoute||DEFAULT_ROUTES[0],mode:'auto',vehicleId:VEHICLES[0].id,ferryId:null,departureDate:'',comment:'',cargoNumbers:[]};
  if(!plan)setNewEditorKey(value=>value+1);
  switchEditor({draft,initial:structuredClone(draft),plan},preserveCurrent);setError('');
 };
 const save=async()=>{
  if(!editor||busy)return;setBusy(true);setError('');
  try{await saveSendingPlanning(auth,editor.draft);setMonth(new Date(`${editor.draft.date.slice(0,7)}-01T12:00:00`));setWeekDate(new Date(`${editor.draft.date}T12:00:00`));setEditor(null);setRefresh(value=>value+1);}
  catch(reason){setError(reason instanceof Error?reason.message:'Не удалось сохранить план');}finally{setBusy(false);}
 };
 const remove=async()=>{
  if(!editor?.plan||busy||!window.confirm('Удалить план и освободить закреплённые перевозки?'))return;
  setBusy(true);setError('');
  try{await deleteSendingPlanning(auth,editor.plan.id,editor.plan.revision);setEditor(null);setRefresh(value=>value+1);}
  catch(reason){setError(reason instanceof Error?reason.message:'Не удалось удалить план');}finally{setBusy(false);}
 };
 const reconcile=async(sendingKey:string)=>{
  if(!editor?.plan||busy||dirty)return;setBusy(true);setError('');
  try{await reconcileSendingPlanning(auth,editor.plan.id,editor.plan.revision,sendingKey);setEditor(null);setRefresh(value=>value+1);}
  catch(reason){setError(reason instanceof Error?reason.message:'Не удалось сверить план');}finally{setBusy(false);}
 };
 const navigate=(offset:number)=>{if(busy)return;if(hasUnsavedChanges&&!window.confirm('Сменить период без сохранения изменений?'))return;resetEditors();if(period==='week')setWeekDate(previous=>new Date(previous.getFullYear(),previous.getMonth(),previous.getDate()+offset*7));else setMonth(previous=>new Date(previous.getFullYear(),previous.getMonth()+offset,1));};
 const changePeriod=(value:'month'|'week')=>{
  if(value===period||busy)return;if(hasUnsavedChanges&&!window.confirm('Сменить период без сохранения изменений?'))return;
  if(value==='week'){
   const now=new Date(),anchor=editor?new Date(`${editor.draft.date}T12:00:00`):month.getFullYear()===now.getFullYear()&&month.getMonth()===now.getMonth()?now:month;
   setWeekDate(anchor);
  }else setMonth(new Date(weekDate.getFullYear(),weekDate.getMonth(),1));
  resetEditors();setPeriod(value);
 };
 const monthLabel=period==='week'?`${readableDate(from).slice(0,5)} — ${readableDate(to)}`:`${month.toLocaleDateString('ru-RU',{month:'long'})} ${month.getFullYear()}`;
 return <GuardedDialog title="Планирование отправок" onClose={close} className={`sending-planning sending-planning--${tab}${editor?' sending-planning--editing':''}`}>
  <header className="sending-planning__header"><h2>Планирование</h2><button type="button" className="sending-planning__icon" aria-label="Закрыть планирование" disabled={busy} onClick={close}><X size={22}/></button></header>
  <div className="sending-planning__toolbar"><div className="sending-planning__tabs"><button type="button" aria-pressed={tab==='calendar'} onClick={()=>setTab('calendar')}><CalendarDays size={16}/> Календарь</button><button type="button" aria-pressed={tab==='table'} onClick={()=>setTab('table')}><Table2 size={16}/> Таблица</button></div><PlanningForecastToggle enabled={forecast.enabled} onToggle={forecast.toggle}/></div>
  <div className="sending-planning__period-row"><div className="sending-planning__tabs" role="group" aria-label="Период отображения планов"><button type="button" aria-pressed={period==='month'} disabled={busy} onClick={()=>changePeriod('month')}>Месяц</button><button type="button" aria-pressed={period==='week'} disabled={busy} onClick={()=>changePeriod('week')}>Неделя</button></div><PlanningLayoutControls layout={workspace.layout} onSelect={workspace.select}/>{editor&&<PlanningToolbarTotals cargo={summaryCargo} draft={editor.draft}/>}</div>
  <div className="sending-planning__month" aria-label={monthLabel}><div><button type="button" className="sending-planning__icon" aria-label={period==='week'?'Предыдущая неделя':'Предыдущий месяц'} disabled={busy} onClick={()=>navigate(-1)}><ChevronLeft size={20}/></button><button type="button" className="filter-button" title={period==='week'?'Вернуться к текущей неделе':'Вернуться к текущему месяцу'} disabled={busy} onClick={()=>{if(hasUnsavedChanges&&!window.confirm('Вернуться к текущему периоду без сохранения изменений?'))return;resetEditors();setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1));setWeekDate(new Date());}}>{monthLabel}</button><button type="button" className="sending-planning__icon" aria-label={period==='week'?'Следующая неделя':'Следующий месяц'} disabled={busy} onClick={()=>navigate(1)}><ChevronRight size={20}/></button></div></div>
  {loading&&<p role="status" className="sending-planning__muted">Загружаем планы и свободные перевозки…</p>}
  {error&&<p role="alert" className="sending-planning__error">{error}{!data&&!loading&&<button type="button" className="filter-button" onClick={()=>setRefresh(value=>value+1)}>Повторить</button>}</p>}
  <div ref={workspace.bodyRef} style={workspace.style} className={`sending-planning__body${editor?' sending-planning__body--editing':''}${editor&&workspace.layout.full?' sending-planning__body--editor-only':''}${workspace.resizing?' sending-planning__body--resizing':''}`}>
   <section className="sending-planning__overview" aria-label={tab==='calendar'?'Календарь планирования':'Таблица планирования'}>
    {tab==='calendar'?<PlanningCalendar forecast={forecast.enabled} available={data?.available||[]} days={days} month={month} period={period} plans={data?.plans||[]} selectedDate={editor?.draft.date} selectedPlanId={editor?.plan?.id} loaded={!!data} busy={busy} onEdit={(date,plan,route)=>edit(date,plan,false,route)}/>:<>

     <PlanningPlansTable plans={data?.plans||[]} view="cargo" busy={busy} expanded={expanded} selectedPlanId={editor?.plan?.id} onEdit={plan=>edit(plan.date,plan,true)} onExpand={id=>setExpanded(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;})} renderExecution={plan=><Execution plan={plan}/>}/>
    </>}
   </section>
   {editor&&<><div className="sending-planning__resizer" {...workspace.separatorProps}><span aria-hidden="true"/></div><PlanningEditor key={editor.plan?.id||`new:${newEditorKey}`} draft={editor.draft} plan={editor.plan} available={data?.available||[]} ferries={data?.ferries||[]} routes={routes} busy={busy} dirty={dirty} onChange={draft=>setEditor(previous=>previous?{...previous,draft:{...draft,isDraft:!!previous.plan?.isDraft&&missingPlanFields(draft).length>0}}:null)} onSave={()=>void save()} onCancel={dismissEditor} onDelete={editor.plan?()=>void remove():undefined} onReconcile={key=>void reconcile(key)}/></>}
  </div>
  {data&&<div className="sending-planning__legend" aria-label="Легенда цветов планирования">{(['roro','ferry','auto','air',''] as const).map(mode=><span key={mode}><i className={`sending-planning__swatch sending-planning__event--${mode||'draft'}`} aria-hidden="true"/>{MODE_LABELS[mode]}</span>)}</div>}
  {data&&<p className="sending-planning__footnote">Свободных перевозок: {data.available.length} · Исполнение рассчитано по перевозкам, включённым в фактические отправки 1С</p>}
 </GuardedDialog>;
}
