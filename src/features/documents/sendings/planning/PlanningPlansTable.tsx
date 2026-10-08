import React from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';
import {MODE_LABELS,vehicleName,groupPlansByVehicle,type PlanningView,type SendingPlan} from './planningModel';
import {PlanningCargoTable} from './PlanningCargoTable';

const readableDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU');
function Cell({children,title}:{children:React.ReactNode;title?:string}) {
 return <div className="sending-planning__table-cell" title={title}>{children}</div>;
}
export function PlanningPlansTable({plans,view,busy,expanded,onEdit,onExpand,renderExecution}:{
 plans:SendingPlan[];view:PlanningView;busy:boolean;expanded:Set<string>;
 onEdit:(plan:SendingPlan)=>void;onExpand:(id:string)=>void;renderExecution:(plan:SendingPlan)=>React.ReactNode;
}) {
 const rows=view==='vehicle'?groupPlansByVehicle(plans).flatMap(group=>group.plans.map((plan,index)=>({plan,group:index===0?group:null}))):plans.map(plan=>({plan,group:null}));
 return <div className="sending-planning__table-scroll"><table className="sending-planning__plans-table">
  <colgroup><col style={{width:110}}/><col style={{width:'23%'}}/><col style={{width:'16%'}}/><col style={{width:'13%'}}/><col style={{width:'20%'}}/><col style={{width:'14%'}}/><col style={{width:52}}/></colgroup>
  <thead><tr><th>Дата</th><th>Маршрут</th><th>Тип / ТС</th><th>Паром / выход</th><th>Исполнение</th><th>Комментарий</th><th/></tr></thead>
  <tbody>{rows.map(({plan,group})=><React.Fragment key={plan.id}>
   {group&&<tr className="sending-planning__vehicle-group"><th colSpan={7}><Cell title={group.label}>{group.label} · {group.plans.length} план.</Cell></th></tr>}
   <tr className="sending-planning__plan-row">
    <td><Cell><button type="button" className="sending-planning__link" disabled={busy} onClick={()=>onEdit(plan)}>{readableDate(plan.date)}</button></Cell></td>
    <td><Cell title={plan.route||'Маршрут не указан'}>{plan.route||'Маршрут не указан'}{plan.isDraft&&<small className="sending-planning__draft-status">Черновик · нужно заполнить</small>}</Cell></td>
    <td><Cell title={`${MODE_LABELS[plan.mode]} · ${vehicleName(plan.vehicleId)}`}>{MODE_LABELS[plan.mode]}{plan.mode!=='air'&&<small>{vehicleName(plan.vehicleId)}</small>}</Cell></td>
    <td><Cell title={`${plan.ferryName||'—'}${plan.departureDate?' · '+readableDate(plan.departureDate):''}`}>{plan.ferryName||'—'}{plan.departureDate&&<small>{readableDate(plan.departureDate)}</small>}</Cell></td>
    <td><Cell>{renderExecution(plan)}</Cell></td>
    <td className="sending-planning__comment"><Cell title={plan.comment||undefined}>{plan.comment||'—'}</Cell></td>
    <td><button type="button" className="sending-planning__icon" aria-label={`Состав плана на ${readableDate(plan.date)}`} aria-expanded={expanded.has(plan.id)} onClick={()=>onExpand(plan.id)}>{expanded.has(plan.id)?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button></td>
   </tr>
   {expanded.has(plan.id)&&<tr className="sending-planning__plan-details"><td colSpan={7}><PlanningCargoTable plan={plan} view={view==='vehicle'?'cargo':view}/></td></tr>}
  </React.Fragment>)}</tbody>
 </table>{!plans.length&&<p className="sending-planning__muted">За этот период ещё нет планов</p>}</div>;
}
