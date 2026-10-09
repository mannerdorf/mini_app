import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ChevronRight,Plus,Scale,X} from 'lucide-react';
import {GuardedDialog} from '../../../../components/GuardedDialog';
import {localDateKey,comparisonCargo,MODE_LABELS,needsFerry,planProgress,planningVehicle,vehicleName,type SendingPlan} from './planningModel';
import {planningNumber} from './PlanningCargoTable';
import {usePlanningToday} from './usePlanningToday';
import {productionCalendarDay} from './planningProductionCalendar';
import {planningLoadTotals} from './PlanningLoadSummary';

const readableDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU');
function description(plan:SendingPlan) {
 const {planned,actual,percent}=planProgress(plan);
 return [plan.route||'Маршрут не указан',MODE_LABELS[plan.mode],vehicleName(plan.vehicleId),plan.ferryName,plan.departureDate&&`Выход: ${readableDate(plan.departureDate)}`,plan.isDraft&&'Черновик · нужно заполнить',planned?`${percent}% · факт ${actual} / план ${planned}`:'Перевозки не добавлены',plan.reconciliation&&`Освобождено для другого дня: ${plan.reconciliation.releasedCargoNumbers.length}`].filter(Boolean).join('\n');
}
function PlanButton({plan,busy,onEdit,full=false,cardHeight=84,fontSize=14}:{plan:SendingPlan;busy:boolean;onEdit:(date:string,plan:SendingPlan)=>void;full?:boolean;cardHeight?:number;fontSize?:number}) {
 const {planned,actual,percent}=planProgress(plan);
 const vehicle=planningVehicle(plan),cargo=comparisonCargo(plan);
 const {totals,missing,count}=planningLoadTotals(cargo);
 const sum=(field:keyof typeof totals)=>totals[field];
 const metric=(field:'weight'|'volume'|'places'|'paidWeight',unit:string,digits=1)=>{
  return missing[field]===count?'—':`${planningNumber(sum(field),digits)} ${unit}${missing[field]?` · нет данных: ${missing[field]}`:''}`;
 };
 const weightPercent=vehicle?.payload&&missing.weight<count?totals.weight/vehicle.payload*100:null;
 const volumePercent=vehicle?.volume&&missing.volume<count?totals.volume/vehicle.volume*100:null;
 const fill=weightPercent===null?volumePercent:volumePercent===null?weightPercent:Math.max(weightPercent,volumePercent);
 const level=fill===null?'unknown':fill<50?'low':fill<=90?'medium':'high';
 const paid=count>0&&missing.paidWeight===count?'—':`${planningNumber(totals.paidWeight)} кг${missing.paidWeight>0?'*':''}`;
 const paidTitle=[`Платный вес: ${metric('paidWeight','кг')}`,fill===null?'Заполнение ТС: нет данных':`Заполнение ТС: ${planningNumber(fill)}% (большее из веса и объёма)`,weightPercent!==null&&`Вес: ${planningNumber(weightPercent)}%`,volumePercent!==null&&`Объём: ${planningNumber(volumePercent)}%`,(missing.weight>0||missing.volume>0)&&'Заполнение рассчитано по известным данным'].filter(Boolean).join('\n');
 const compactStyle={height:cardHeight,'--planning-event-font':`${fontSize}px`,'--planning-event-line-height':`${(cardHeight-4)/4}px`} as React.CSSProperties;
 return <button type="button" className={`sending-planning__event sending-planning__event--${plan.mode||'draft'}${full?' sending-planning__event--full':''}`} style={full?undefined:compactStyle} disabled={busy} onClick={()=>onEdit(plan.date,plan)} aria-label={`План ${readableDate(plan.date)}, ${plan.route||'Маршрут не указан'}, ${MODE_LABELS[plan.mode]}`} title={description(plan)}>
  <span className="sending-planning__event-heading"><b>{plan.route||'Маршрут не указан'}</b>{count>0&&<small className={`sending-planning__event-paid sending-planning__event-paid--${level}`} aria-label={paidTitle} title={paidTitle}><Scale size={13} aria-hidden="true"/><span>{paid}</span></small>}</span>
  {full?<span>{MODE_LABELS[plan.mode]} · {needsFerry(plan.mode)||!plan.mode?plan.ferryName||'Паром не выбран':plan.mode==='auto'?vehicleName(plan.vehicleId):'Авиаперевозка'}</span>:<>
   <span>{MODE_LABELS[plan.mode]}{plan.mode&&plan.mode!=='air'?` · ${vehicleName(plan.vehicleId)}`:''}</span>
   <span className="sending-planning__event-departure">{plan.ferryName?`${plan.ferryName}${plan.departureDate?` · ${readableDate(plan.departureDate)}`:''}`:plan.departureDate?`Выход: ${readableDate(plan.departureDate)}`:needsFerry(plan.mode)||!plan.mode?'Паром не выбран':plan.isDraft?'Черновик · нужно заполнить':plan.comment?`Комментарий: ${plan.comment}`:'—'}</span>
  </>}
  {full&&<>
   {needsFerry(plan.mode)&&<span>ТС: {vehicleName(plan.vehicleId)}</span>}
   {plan.departureDate&&<span>Выход: {readableDate(plan.departureDate)}</span>}
   {plan.isDraft&&<span>Черновик · нужно заполнить</span>}
   {plan.vehicleDimensions&&<span>Размеры: {[plan.vehicleDimensions.length,plan.vehicleDimensions.width,plan.vehicleDimensions.height].map(value=>planningNumber(value,2)).join(' × ')} м</span>}
   {cargo.length>0&&<div className="sending-planning__event-metrics">
    <span>Вес: {metric('weight','кг')}</span><span>Объём: {metric('volume','м³',2)}</span>
    <span>Количество: {cargo.length} перев. · {metric('places','мест',0)}</span>
    {vehicle&&<span>Заполнение ТС: вес {planningNumber(sum('weight')/vehicle.payload*100,0)}% · объём {planningNumber(sum('volume')/vehicle.volume*100,0)}%</span>}
   </div>}
   {plan.reconciliation&&<span>Освобождено для другого дня: {plan.reconciliation.releasedCargoNumbers.length}</span>}
   {plan.comment&&<span className="sending-planning__event-comment">Комментарий: {plan.comment}</span>}
  </>}
  <span className="sending-planning__execution"><span>{planned?`${percent}% · факт ${actual} / план ${planned}`:'Перевозки не добавлены'}</span>{full&&planned>0&&<span role="progressbar" aria-label="Исполнение плана" aria-valuemin={0} aria-valuemax={planned} aria-valuenow={actual} aria-valuetext={`${percent}%, отправлено ${actual} из ${planned}`}><i style={{width:`${percent}%`}}/></span>}</span>
 </button>;
}
function CalendarDay({day,plans,cellHeight,cellWidth,month,period,selectedDate,selectedPlanId,loaded,busy,today,onEdit,onShowAll}:{day:Date;plans:SendingPlan[];cellHeight:number;cellWidth:number;month:Date;period:'month'|'week';selectedDate?:string;selectedPlanId?:string;loaded:boolean;busy:boolean;today:string;onEdit:(date:string,plan?:SendingPlan)=>void;onShowAll:(date:string)=>void}) {
 const measurement=useRef<HTMLDivElement>(null),[weekFits,setWeekFits]=useState(false),[activePlanId,setActivePlanId]=useState<string>();
 const selectedPlan=plans.find(plan=>plan.id===selectedPlanId);
 useEffect(()=>{if(selectedPlan)setActivePlanId(selectedPlan.id);},[selectedPlan?.id]);
 const index=Math.max(0,plans.findIndex(plan=>plan.id===activePlanId)),plan=plans[index];
 useLayoutEffect(()=>{
  if(period!=='week'||!measurement.current)return;
  const card=measurement.current.firstElementChild;
  setWeekFits(!!card&&card.getBoundingClientRect().height+4<=cellHeight-(cellWidth<90?46:26));
 },[plan,cellHeight,cellWidth,period]);
 const date=localDateKey(day),cardHeight=Math.min(84,cellHeight-(cellWidth<90?52:34));
 const fontSize=Math.max(11,Math.min(cellWidth<190?12:14,Math.floor((cardHeight-4)/4/1.3)));
 const fits=period==='week'?weekFits:cardHeight>=60;
 const calendarDay=productionCalendarDay(day);
 const open=()=>{if(loaded&&!busy&&(plan||date>=today))onEdit(date,plan);};
 const counter=`${index+1} из ${plans.length}`;
 return <div data-date={date} title={calendarDay.description} className={`sending-planning__day${calendarDay.isDayOff?' is-day-off':''}${cellWidth<90?' is-narrow':''}${cellHeight<54?' is-compact':''}${period==='month'&&day.getMonth()!==month.getMonth()?' is-outside':''}${date===today?' is-today':''}${date===selectedDate?' is-selected':''}`}>
  <button type="button" className="sending-planning__day-target" aria-label={`${plan?'Открыть план':'Создать новый план'} на ${readableDate(date)}`} disabled={!loaded||busy||!plan&&date<today} onClick={open}/>
  <div className="sending-planning__day-heading">
   <button type="button" className="sending-planning__date" aria-label={`${plan?'Открыть план':'Запланировать отправку'} на ${readableDate(date)}`} aria-description={calendarDay.description} title={`${calendarDay.description}${!plan&&date<today?'\nНа прошедшие даты нельзя добавлять перевозки':''}`} disabled={!loaded||busy||!plan&&date<today} onClick={open}><span>{day.getDate()}</span></button>
   {plans.length>1&&<button type="button" className="sending-planning__next-plan" disabled={busy} aria-label={`Следующий план на ${readableDate(date)}`} title={`План ${counter}. Показать следующий`} onClick={()=>setActivePlanId(plans[(index+1)%plans.length].id)}><span aria-live="polite" aria-atomic="true" aria-label={`План ${counter}`}>{cellWidth<110?`${index+1}/${plans.length}`:counter}</span><ChevronRight size={13} aria-hidden="true"/></button>}
   {date>=today&&<button type="button" className="sending-planning__add-plan" disabled={!loaded||busy} aria-label={`Добавить ${plan?'ещё ':''}план на ${readableDate(date)}`} title={plan?'Добавить ещё один план на этот день':'Добавить план на этот день'} onClick={()=>onEdit(date)}><Plus size={14} aria-hidden="true"/></button>}
  </div>
  {period==='week'&&<div ref={measurement} className="sending-planning__event-measurement" aria-hidden="true">{plan&&<PlanButton plan={plan} busy full onEdit={()=>{}}/>}</div>}
  {plan&&fits&&<PlanButton plan={plan} busy={busy} full={period==='week'} cardHeight={cardHeight} fontSize={fontSize} onEdit={onEdit}/>}
  {plan&&!fits&&<button type="button" className="sending-planning__more" disabled={busy} aria-label={`Все планы на ${readableDate(date)}: ${plans.length}`} onClick={()=>onShowAll(date)} title={description(plan)}>{cellHeight<54?'Открыть':plan.route||'Открыть план'}</button>}
 </div>;
}
export function PlanningCalendar({days,month,period,plans,selectedDate,selectedPlanId,loaded,busy,onEdit}:{days:Date[];month:Date;period:'month'|'week';plans:SendingPlan[];selectedDate?:string;selectedPlanId?:string;loaded:boolean;busy:boolean;onEdit:(date:string,plan?:SendingPlan)=>void}) {
 const today=usePlanningToday();
 const ref=useRef<HTMLDivElement>(null),[size,setSize]=useState({height:0,width:0}),[openDay,setOpenDay]=useState<string|null>(null);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;
  const update=()=>setSize(previous=>previous.height===node.clientHeight&&previous.width===node.clientWidth?previous:{height:node.clientHeight,width:node.clientWidth});
  const observer=new ResizeObserver(update);observer.observe(node);update();
  return()=>observer.disconnect();
 },[]);
 const rows=days.length/7,cellHeight=(size.height-29)/rows,cellWidth=size.width/7;
 return <div ref={ref} className={`sending-planning__calendar sending-planning__calendar--${period}`} style={{gridTemplateRows:`28px repeat(${rows},minmax(0,1fr))`}}>
  {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((day,index)=>{
   const calendarDay=period==='week'?productionCalendarDay(days[index]):undefined;
   return <div className={`sending-planning__weekday${(calendarDay?calendarDay.isDayOff:index>=5)?' is-day-off':''}`} title={calendarDay?.description} key={day}>{day}</div>;
  })}
  {days.map(day=><CalendarDay key={localDateKey(day)} day={day} plans={plans.filter(plan=>plan.date===localDateKey(day))} cellHeight={cellHeight} cellWidth={cellWidth} month={month} period={period} selectedDate={selectedDate} selectedPlanId={selectedPlanId} loaded={loaded} busy={busy} today={today} onEdit={onEdit} onShowAll={setOpenDay}/>)}
  {openDay&&<GuardedDialog title={`Планы на ${readableDate(openDay)}`} className="sending-planning-day-dialog" onClose={()=>setOpenDay(null)}>
   <header><b>Планы на {readableDate(openDay)}</b><button type="button" className="sending-planning__icon" aria-label="Закрыть список планов" onClick={()=>setOpenDay(null)}><X size={20}/></button></header>
   {plans.filter(plan=>plan.date===openDay).map(plan=><PlanButton key={plan.id} plan={plan} busy={busy} full onEdit={(date,value)=>{setOpenDay(null);onEdit(date,value);}}/>)}
  </GuardedDialog>}
 </div>;
}
