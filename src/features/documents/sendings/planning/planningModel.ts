import {VEHICLES,type TmsCargo} from '../../../tms/model.js';

export type PlanningMode='roro'|'ferry'|'auto'|'air'|'';
export type PlanningView='cargo'|'customer'|'receiver'|'vehicle';
export type PlanDraft={id?:string;revision?:number;title?:string;isDraft?:boolean;departureDate?:string;date:string;route:string;mode:PlanningMode;vehicleId:string;ferryId:number|null;comment:string;cargoNumbers:string[]};
export type SendingPlan=Omit<PlanDraft,'cargoNumbers'|'id'|'revision'> & {id:string;revision:number;ferryName:string;cargo:TmsCargo[];actualCargoNumbers:string[]};
export type PlanningData={plans:SendingPlan[];available:TmsCargo[];ferries:{id:number;name:string}[];checkedAt:string};
// Keep the persisted ferry value for existing container plans.
export const MODE_LABELS:Record<PlanningMode,string>={roro:'RoRo',ferry:'Контейнер',auto:'Авто',air:'Авиа','':'Тип не указан'};
export const needsFerry=(mode:PlanningMode)=>mode==='ferry'||mode==='roro';
export const usesRoadVehicle=(mode:PlanningMode)=>mode==='auto'||mode==='roro';
export function missingPlanFields(draft:PlanDraft):string[] {
 const missing:string[]=[];
 if(!draft.route)missing.push('маршрут');
 if(!draft.mode)missing.push('тип транспорта');
 if(draft.mode&&draft.mode!=='air'&&!draft.vehicleId)missing.push(usesRoadVehicle(draft.mode)?'тип ТС':'тип контейнера');
 if(needsFerry(draft.mode)&&!draft.ferryId)missing.push('паром');
 return missing;
}
export const DEFAULT_ROUTES=['MSK → KGD','KGD → MSK'];
export const vehicleName=(id:string)=>VEHICLES.find(vehicle=>vehicle.id===id)?.name||'—';
export function localDateKey(date:Date):string {
 return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function calendarDays(month:Date):Date[] {
 const start=new Date(month.getFullYear(),month.getMonth(),1);
 start.setDate(start.getDate()-(start.getDay()+6)%7);
 return Array.from({length:42},(_,index)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+index));
}
export function planProgress(plan:SendingPlan) {
 const numbers=new Set(plan.cargo.map(cargo=>cargo.number));
 const actual=new Set(plan.actualCargoNumbers.filter(number=>numbers.has(number))).size;
 return {planned:numbers.size,actual,percent:numbers.size?Math.round(actual/numbers.size*100):0};
}
export function groupPlannedCargo(plan:SendingPlan,view:PlanningView) {
 const groups=new Map<string,TmsCargo[]>();
 for(const cargo of plan.cargo){
  const key=view==='customer'?cargo.customerId:view==='receiver'?cargo.receiver:cargo.number;
  groups.set(key,[...(groups.get(key)||[]),cargo]);
 }
 const actual=new Set(plan.actualCargoNumbers);
 return [...groups.values()].map(cargo=>({
  key:view==='customer'?cargo[0].customerId:view==='receiver'?cargo[0].receiver:cargo[0].number,
  label:view==='customer'?cargo[0].customer:view==='receiver'?cargo[0].receiver:cargo[0].number,
  cargo,actual:cargo.filter(item=>actual.has(item.number)).length,
  places:cargo.reduce((sum,item)=>sum+(item.places||0),0),weight:cargo.reduce((sum,item)=>sum+(item.weight||0),0),volume:cargo.reduce((sum,item)=>sum+(item.volume||0),0),
 }));
}

export function groupPlansByVehicle(plans:SendingPlan[]) {
 const groups=new Map<string,{key:string;label:string;plans:SendingPlan[]}>();
 for(const plan of plans){
  const key=`${plan.mode}:${plan.mode==='air'?'':plan.vehicleId}`;
  const label=MODE_LABELS[plan.mode]+(plan.mode&&plan.mode!=='air'?` · ${vehicleName(plan.vehicleId)==='—'?'Тип ТС не выбран':vehicleName(plan.vehicleId)}`:'');
  const group=groups.get(key)||{key,label,plans:[]};
  group.plans.push(plan);groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label,'ru')).map(group=>({...group,plans:group.plans.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))}));
}
