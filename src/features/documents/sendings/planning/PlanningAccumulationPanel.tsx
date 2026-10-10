import React,{useState} from 'react';
import {TrendingUp} from 'lucide-react';
import {VEHICLES,type Vehicle} from '../../../tms/model';
import {planningNumber} from './PlanningCargoTable';
import type {AccumulationData,FlowDay} from './accumulationModel';
import type {AccumulationResult} from './accumulationForecast';
const dateLabel=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
function FlowChart({title,history,future,unit}:{title:string;history:FlowDay[];future:{date:string;value:number}[];unit:'weight'|'volume'}){
 const values=[...history.map(day=>({date:day.date,value:day[unit],forecast:false})),...future.map(day=>({...day,forecast:true}))];
 const max=Math.max(1,...values.map(day=>day.value)),x=(index:number)=>36+index/(values.length-1||1)*560,y=(value:number)=>110-value/max*85;
 const past=values.filter(day=>!day.forecast),projected=values.slice(Math.max(0,past.length-1));
 const path=(rows:typeof values,offset:number)=>rows.map((day,index)=>`${index?'L':'M'}${x(index+offset)},${y(day.value)}`).join(' ');
 return <figure className="sending-planning__flow-chart"><figcaption>{title} · {unit==='volume'?'м³':'кг'}/день</figcaption><svg viewBox="0 0 620 140" role="img" aria-label={`${title}: факт за 30 дней и прогноз на 30 дней`}>
  <line x1="36" y1="110" x2="596" y2="110" stroke="currentColor" opacity=".25"/>
  <line x1={x(past.length-1)} y1="15" x2={x(past.length-1)} y2="110" stroke="currentColor" opacity=".35" strokeDasharray="3 3"/>
  <text x="3" y="28">{planningNumber(max,0)}</text><text x="22" y="113">0</text>
  <path d={path(past,0)} fill="none" stroke="#3275fa" strokeWidth="2"/>
  <path d={path(projected,past.length-1)} fill="none" stroke="#a16ee8" strokeWidth="2" strokeDasharray="5 3"/>
  {values.map((day,index)=><circle key={day.date} cx={x(index)} cy={y(day.value)} r="3" fill={day.forecast?'#a16ee8':'#3275fa'}><title>{dateLabel(day.date)} · {planningNumber(day.value,2)} {unit==='volume'?'м³':'кг'} · {day.forecast?'прогноз':'факт'}</title></circle>)}
  <text x="36" y="134">{dateLabel(values[0]?.date||'2026-01-01')}</text><text x={x(past.length-1)-20} y="134">{dateLabel(past.at(-1)?.date||'2026-01-01')}</text><text x="554" y="134">{dateLabel(values.at(-1)?.date||'2026-01-01')}</text>
 </svg></figure>;
}
export function PlanningAccumulationPanel({data,routeName,vehicle,result,onRoute,onVehicle}:{data:AccumulationData;routeName:string;vehicle:Vehicle;result:AccumulationResult|null;onRoute:(route:string)=>void;onVehicle:(id:string)=>void}){
 const [unit,setUnit]=useState<'weight'|'volume'>('volume'),route=data.routes.find(item=>item.route===routeName);
 return <section className="sending-planning__accumulation" aria-label="Прогноз накопления груза">
  <div className="sending-planning__accumulation-controls"><strong><TrendingUp size={16} aria-hidden="true"/> Прогноз накопления</strong><label>Маршрут <select value={routeName} onChange={event=>onRoute(event.target.value)}>{data.routes.map(route=><option key={route.route}>{route.route}</option>)}</select></label><label>ТС <select value={vehicle.id} onChange={event=>onVehicle(event.target.value)}>{VEHICLES.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
  {route&&result?<>
   <div className="sending-planning__accumulation-summary"><span>Остаток: <b>{planningNumber(route.stock.volume,1)} м³ · {planningNumber(route.stock.weight,0)} кг</b></span><span>Поступление: <b>{planningNumber(result.daily.volume,1)} м³ · {planningNumber(result.daily.weight,0)} кг/день</b></span><span>До 80% ТС: <b>{result.firstDate?dateLabel(result.firstDate):'Не накопится за 90 дней'}</b>{result.firstDate&&<small> · темп ±25%: {result.earliest?dateLabel(result.earliest):'>90 дней'} — {result.latest?dateLabel(result.latest):'>90 дней'}</small>}</span></div>
   {!result.complete&&<p role="status">Есть грузы без веса или объёма: прогноз по известной части остатка и поступлений.</p>}
   <details><summary>Графики поступления и выбытия · последние 30 дней + прогноз</summary><div className="sending-planning__flow-details"><div className="sending-planning__tabs" role="group" aria-label="Единица графиков"><button type="button" aria-pressed={unit==='volume'} onClick={()=>setUnit('volume')}>Объём, м³</button><button type="button" aria-pressed={unit==='weight'} onClick={()=>setUnit('weight')}>Вес, кг</button></div><div className="sending-planning__flow-grid">
    <FlowChart title="Поступление груза" unit={unit} history={route.incoming} future={result.points.slice(1,31).map(point=>({date:point.date,value:point.incoming[unit]}))}/>
    <FlowChart title="Выбытие груза" unit={unit} history={route.outgoing} future={result.points.slice(1,31).map(point=>({date:point.date,value:point.outgoing[unit]}))}/>
   </div><p className="sending-planning__muted">Факт — синий, прогноз — пунктир. Поступления: среднее за 30 полных дней, включая дни без груза. Будущее выбытие: только существующие ТС, по вместимости и прогнозируемой плотности; фактическая загрузка может отличаться. Новые рекомендации не списывают груз из остатка.</p>
   <table className="sending-planning__projection-table"><caption>Ожидаемый остаток после существующих рейсов</caption><thead><tr><th>Дата</th><th>Приход, м³</th><th>Выбытие, м³</th><th>Остаток, м³</th><th>Остаток, кг</th></tr></thead><tbody>{result.points.slice(0,31).map(point=><tr key={point.date}><td>{dateLabel(point.date)}</td><td>{planningNumber(point.incoming.volume,1)}</td><td>{planningNumber(point.outgoing.volume,1)}</td><td>{planningNumber(point.stock.volume,1)}</td><td>{planningNumber(point.stock.weight,0)}</td></tr>)}</tbody></table>
   </div></details>
  </>:<p>Для этого маршрута пока нет данных.</p>}
  {(data.unmatchedDepartures||0)>0&&<small>Нет данных о весе и объёме для {data.unmatchedDepartures} выбывших перевозок: график выбытия неполный.</small>}
  {data.undatedDepartures>0&&<small>В БД {data.undatedDepartures} отправок без даты выезда; они не включены в график выбытия.</small>}
 </section>;
}
