import React,{useLayoutEffect,useRef,useState} from 'react';
import {Plus,X} from 'lucide-react';
import {GuardedDialog} from '../../../../components/GuardedDialog';
import {localDateKey,MODE_LABELS,needsFerry,planProgress,vehicleName,type SendingPlan} from './planningModel';

const readableDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU');
function description(plan:SendingPlan) {
 const {planned,actual,percent}=planProgress(plan);
 return [plan.route||'Маршрут не указан',MODE_LABELS[plan.mode],vehicleName(plan.vehicleId),plan.ferryName,plan.departureDate&&`Выход: ${readableDate(plan.departureDate)}`,plan.isDraft&&'Черновик · нужно заполнить',planned?`${percent}% · факт ${actual} / план ${planned}`:'Перевозки не добавлены'].filter(Boolean).join('\n');
}
function PlanButton({plan,busy,onEdit,full=false}:{plan:SendingPlan;busy:boolean;onEdit:(date:string,plan:SendingPlan)=>void;full?:boolean}) {
 const {planned,actual,percent}=planProgress(plan);
 return <button type="button" className={`sending-planning__event sending-planning__event--${plan.mode||'draft'}`} disabled={busy} onClick={()=>onEdit(plan.date,plan)} aria-label={`План ${readableDate(plan.date)}, ${plan.route||'Маршрут не указан'}, ${MODE_LABELS[plan.mode]}`} title={description(plan)}>
  <b>{plan.route||'Маршрут не указан'}{!full&&planned>0?` · ${percent}%`:''}</b>
  <span>{MODE_LABELS[plan.mode]} · {needsFerry(plan.mode)||!plan.mode?plan.ferryName||'Паром не выбран':plan.mode==='auto'?vehicleName(plan.vehicleId):'Авиаперевозка'}</span>
  {full&&<><small>{needsFerry(plan.mode)&&vehicleName(plan.vehicleId)}</small>{plan.departureDate&&<small>Выход: {readableDate(plan.departureDate)}</small>}{plan.isDraft&&<small>Черновик · нужно заполнить</small>}<span>{planned?`${percent}% · факт ${actual} / план ${planned}`:'Перевозки не добавлены'}</span></>}
 </button>;
}
export function PlanningCalendar({days,month,period,plans,selectedDate,loaded,busy,onEdit}:{days:Date[];month:Date;period:'month'|'week';plans:SendingPlan[];selectedDate?:string;loaded:boolean;busy:boolean;onEdit:(date:string,plan?:SendingPlan)=>void}) {
 const ref=useRef<HTMLDivElement>(null),[height,setHeight]=useState(0),[openDay,setOpenDay]=useState<string|null>(null);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;
  const observer=new ResizeObserver(()=>setHeight(node.clientHeight));observer.observe(node);setHeight(node.clientHeight);
  return()=>observer.disconnect();
 },[]);
 const rows=days.length/7,cellHeight=(height-29)/rows,slotHeight=period==='month'?28:56;
 const slots=Math.max(0,Math.floor((cellHeight-26)/slotHeight)),today=localDateKey(new Date());
 return <div ref={ref} className={`sending-planning__calendar sending-planning__calendar--${period}`} style={{gridTemplateRows:`28px repeat(${rows},minmax(0,1fr))`}}>
  {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=><div className="sending-planning__weekday" key={day}>{day}</div>)}
  {days.map(day=>{
   const date=localDateKey(day),dayPlans=plans.filter(plan=>plan.date===date),visible=dayPlans.length>slots?Math.max(0,slots-1):slots;
   return <div key={date} className={`sending-planning__day${slots===0?' is-compact':''}${period==='month'&&day.getMonth()!==month.getMonth()?' is-outside':''}${date===today?' is-today':''}${date===selectedDate?' is-selected':''}`} onClick={event=>{if(event.target===event.currentTarget&&loaded&&!busy)onEdit(date);}}>
    <button type="button" className="sending-planning__date" aria-label={`Запланировать отправку на ${readableDate(date)}`} disabled={!loaded||busy} onClick={()=>onEdit(date)}><span>{day.getDate()}</span><Plus size={13}/></button>
    {dayPlans.slice(0,visible).map(plan=><PlanButton key={plan.id} plan={plan} busy={busy} onEdit={onEdit}/>)}
    {dayPlans.length>visible&&<button type="button" className="sending-planning__more" disabled={busy} aria-label={`Все планы на ${readableDate(date)}: ${dayPlans.length}`} onClick={()=>setOpenDay(date)} title={dayPlans.map(description).join('\n\n')}>{slots===0?`${dayPlans.length} пл.`:visible?`Ещё ${dayPlans.length-visible}`:`Планы: ${dayPlans.length}`}</button>}
   </div>;
  })}
  {openDay&&<GuardedDialog title={`Планы на ${readableDate(openDay)}`} className="sending-planning-day-dialog" onClose={()=>setOpenDay(null)}>
   <header><b>Планы на {readableDate(openDay)}</b><button type="button" className="sending-planning__icon" aria-label="Закрыть список планов" onClick={()=>setOpenDay(null)}><X size={20}/></button></header>
   {plans.filter(plan=>plan.date===openDay).map(plan=><PlanButton key={plan.id} plan={plan} busy={busy} full onEdit={(date,value)=>{setOpenDay(null);onEdit(date,value);}}/>)}
  </GuardedDialog>}
 </div>;
}
