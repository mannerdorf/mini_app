import React from 'react';
import {Box,Package,Scale,Weight} from 'lucide-react';
import type {TmsCargo} from '../../../tms/model';
import {planningVehicle,type PlanDraft} from './planningModel';
import {planningNumber} from './PlanningCargoTable';
import {planningLoadTotals} from './PlanningLoadSummary';

export function PlanningToolbarTotals({cargo,draft}:{cargo:TmsCargo[];draft:PlanDraft}) {
 const {totals,missing,count}=planningLoadTotals(cargo),vehicle=planningVehicle(draft);
 const weightPercent=vehicle?.payload?totals.weight/vehicle.payload*100:null;
 const volumePercent=vehicle?.volume?totals.volume/vehicle.volume*100:null;
 const incomplete=(amount:number)=>amount?` · нет данных: ${amount} перев. Итог по известным данным.`:'';
 const weightTitle=`Вес: ${planningNumber(totals.weight)}${vehicle?.payload?` / ${planningNumber(vehicle.payload)}`:''} кг${weightPercent===null?'':` · заполнение ${planningNumber(weightPercent,0)}%${weightPercent>100?' · Перегруз':''}`}${incomplete(missing.weight)}`;
 const volumeTitle=`Объём: ${planningNumber(totals.volume,2)}${vehicle?.volume?` / ${planningNumber(vehicle.volume,2)}`:''} м³${volumePercent===null?'':` · заполнение ${planningNumber(volumePercent,0)}%${volumePercent>100?' · Перегруз':''}`}${incomplete(missing.volume)}`;
 const countTitle=`Количество: ${count} перев. · ${planningNumber(totals.places,0)} мест${incomplete(missing.places)}`;
 const paid=count>0&&missing.paidWeight===count?'—':`${planningNumber(totals.paidWeight)} кг`;
 const paidTitle=`Платный вес: ${paid}${incomplete(missing.paidWeight)}`;
 return <div className="sending-planning__toolbar-totals" role="group" aria-label="Краткие итоги выбранных перевозок" title={[weightTitle,volumeTitle,countTitle,paidTitle].join('\n')}>
  <div className="sending-planning__toolbar-metrics">
   <span className={`sending-planning__toolbar-metric sending-planning__toolbar-weight${weightPercent!==null&&weightPercent>100?' is-overloaded':''}`} role="img" tabIndex={0} aria-label={weightTitle} title={weightTitle}><Weight size={16} aria-hidden="true"/><span>{planningNumber(totals.weight)} кг{missing.weight>0?'*':''}</span>{weightPercent!==null&&<small className="sending-planning__toolbar-percent">{planningNumber(weightPercent,0)}%</small>}</span>
   <span className={`sending-planning__toolbar-metric sending-planning__toolbar-volume${volumePercent!==null&&volumePercent>100?' is-overloaded':''}`} role="img" tabIndex={0} aria-label={volumeTitle} title={volumeTitle}><Box size={16} aria-hidden="true"/><span>{planningNumber(totals.volume,2)} м³{missing.volume>0?'*':''}</span>{volumePercent!==null&&<small className="sending-planning__toolbar-percent">{planningNumber(volumePercent,0)}%</small>}</span>
   <span className="sending-planning__toolbar-metric sending-planning__toolbar-count" role="img" tabIndex={0} aria-label={countTitle} title={countTitle}><Package size={16} aria-hidden="true"/><span>{count} перев. · {planningNumber(totals.places,0)} мест{missing.places>0?'*':''}</span></span>
   <span className="sending-planning__toolbar-metric sending-planning__toolbar-paid" role="img" tabIndex={0} aria-label={paidTitle} title={paidTitle}><Scale size={16} aria-hidden="true"/><span>{paid}{missing.paidWeight>0&&missing.paidWeight<count?'*':''}</span></span>
  </div>
 </div>;
}
