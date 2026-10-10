import type {Vehicle} from '../../../tms/model';
import {planningVehicle} from './planningModel';
import {shiftDay,type AccumulationData,type CargoAmount,type ForecastSchedule,type RouteFlows} from './accumulationModel';
export type AccumulationEvent={id:string;date:string;route:string;kind:'scheduled'|'gap';vehicleId:string;label:string;weight:number;volume:number;fill:number;count:number;partial?:boolean};
export type ForecastPoint={date:string;stock:CargoAmount;incoming:CargoAmount;outgoing:CargoAmount};
export type AccumulationResult={points:ForecastPoint[];events:AccumulationEvent[];firstDate:string|null;earliest:string|null;latest:string|null;daily:CargoAmount;complete:boolean};
const plus=(a:CargoAmount,b:CargoAmount)=>({weight:a.weight+b.weight,volume:a.volume+b.volume});
export const fillRatio=(amount:CargoAmount,vehicle:Vehicle)=>Math.max(amount.weight/vehicle.payload,amount.volume/vehicle.volume);
/** Withdraw the same aggregate density in both units, constrained by BOTH limits. */
function load(amount:CargoAmount,vehicle:Vehicle):CargoAmount{
 const share=Math.min(1,amount.weight>0?vehicle.payload/amount.weight:1,amount.volume>0?vehicle.volume/amount.volume:1);
 return {weight:amount.weight*share,volume:amount.volume*share};
}
const subtract=(a:CargoAmount,b:CargoAmount)=>({weight:Math.max(0,a.weight-b.weight),volume:Math.max(0,a.volume-b.volume)});
function simulate(route:RouteFlows,schedule:ForecastSchedule[],today:string,vehicle:Vehicle,daily:CargoAmount,horizon:number){
 let stock={...route.stock},coverage={...stock},firstDate:string|null=null;const points:ForecastPoint[]=[],events:AccumulationEvent[]=[];
 for(let day=0;day<=horizon;day++){
  const date=shiftDay(today,day),incoming=day?daily:{weight:0,volume:0};stock=plus(stock,incoming);coverage=plus(coverage,incoming);
  if(firstDate===null&&fillRatio(stock,vehicle)>=.8-1e-9)firstDate=date;
  let outgoing={weight:0,volume:0};
  for(const plan of schedule.filter(p=>p.route===route.route&&p.date===date)){
   const capacity=planningVehicle(plan);if(!capacity)continue;
   const removed=load(stock,capacity);stock=subtract(stock,removed);outgoing=plus(outgoing,removed);
   const covered=load(coverage,capacity);coverage=subtract(coverage,covered);
   events.push({id:plan.id,date,route:route.route,kind:'scheduled',vehicleId:plan.vehicleId,label:capacity.name,...removed,fill:fillRatio(removed,capacity)*100,count:1});
  }
  points.push({date,stock:{...stock},incoming:{...incoming},outgoing});
  // Recommendations have their own coverage ledger. They do NOT silently
  // deduct hypothetical trips from the warehouse balance chart.
  const ratio=fillRatio(coverage,vehicle);
  if(ratio>=.8-1e-9){
   const whole=Math.floor(ratio+1e-9),count=whole+(ratio-whole>=.8-1e-9?1:0);
   const one=load(coverage,vehicle),removed={weight:Math.min(coverage.weight,one.weight*count),volume:Math.min(coverage.volume,one.volume*count)};
   coverage=subtract(coverage,removed);
   events.push({id:`forecast:${route.route}:${date}`,date,route:route.route,kind:'gap',vehicleId:vehicle.id,label:vehicle.name,...removed,fill:Math.min(100,ratio/count*100),count});
  }
 }
 return {points,events,firstDate};
}
export function forecastAccumulation(data:AccumulationData,routeName:string,vehicle:Vehicle,horizon=90):AccumulationResult|null{
 const route=data.routes.find(r=>r.route===routeName);if(!route)return null;
 const daily=route.incoming.reduce((sum,day)=>plus(sum,day),{weight:0,volume:0});
 daily.weight/=30;daily.volume/=30;
 const result=simulate(route,data.schedule,data.today,vehicle,daily,horizon);
 const faster=simulate(route,data.schedule,data.today,vehicle,{weight:daily.weight*1.25,volume:daily.volume*1.25},horizon);
 const slower=simulate(route,data.schedule,data.today,vehicle,{weight:daily.weight*.75,volume:daily.volume*.75},horizon);
 const complete=route.stockMissing===0&&route.incoming.every(day=>day.missing===0);
 return {...result,events:result.events.map(event=>({...event,partial:!complete})),daily,earliest:faster.firstDate,latest:slower.firstDate,complete};
}
