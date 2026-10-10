import type {TmsCargo} from '../../../tms/model';
import {comparisonCargo,needsFerry,planningToday,planningVehicle,type SendingPlan} from './planningModel';

export type ForecastLevel='ready'|'low'|'risk'|'unknown';
export function planForecast(plan:SendingPlan) {
 const vehicle=planningVehicle(plan),cargo=comparisonCargo(plan);
 const sum=(field:'weight'|'volume')=>cargo.reduce((total,item)=>total+(item[field]??0),0);
 const known=cargo.every(item=>item.weight!=null&&item.volume!=null);
 const fill=vehicle?Math.max(sum('weight')/vehicle.payload,sum('volume')/vehicle.volume)*100:null;
 const missingTransport=!plan.mode||plan.mode!=='air'&&!vehicle||needsFerry(plan.mode)&&!plan.ferryId;
 const late=cargo.some(item=>item.slaDeadline&&Number.isFinite(Date.parse(item.slaDeadline))&&planningToday(new Date(item.slaDeadline))<plan.date);
 const level:ForecastLevel=missingTransport||late||(fill!==null&&fill>100)?'risk':!vehicle||!known?'unknown':fill!==null&&fill>=80?'ready':'low';
 const label=missingTransport?'ТС не заполнено':late?'План позже SLA':fill!==null&&fill>100?'Перегруз':!known?'Неполные данные':fill===null?'Нет вместимости':`${Math.round(fill)}% · ${fill>=80?'от 80%':'ниже 80%'}`;
 return {level,label,fill,detail:[label,'Заполнение — большее из веса и объёма; геометрия укладки не проверена.',late&&'Дата плана уже позже срока вручения. Более ранний план сам по себе не гарантирует SLA.'].filter(Boolean).join('\n')};
}
export type PlanningGap={key:string;date:string;route:string;cargo:TmsCargo[];overdue:boolean;unknownDeadline:boolean};
/** Available already excludes reservations across ALL dates in the database. These are
 * allocation gaps, anchored to handover deadlines, not invented departure forecasts. */
export function planningGaps(available:TmsCargo[],today:string):PlanningGap[] {
 const groups=new Map<string,PlanningGap>(),seen=new Set<string>();
 for(const cargo of available){
  if(seen.has(cargo.number)||cargo.readiness!=='ready')continue;
  seen.add(cargo.number);
  const valid=!!cargo.slaDeadline&&Number.isFinite(Date.parse(cargo.slaDeadline));
  const deadline=valid?planningToday(new Date(cargo.slaDeadline!)):null;
  const overdue=!!deadline&&deadline<today,unknownDeadline=!deadline;
  const date=!deadline||overdue?today:deadline;
  const key=`${date}:${cargo.route}:${overdue}:${unknownDeadline}`;
  const group=groups.get(key)||{key,date,route:cargo.route,cargo:[],overdue,unknownDeadline};
  group.cargo.push(cargo);groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||Number(b.overdue)-Number(a.overdue)||a.route.localeCompare(b.route));
}
