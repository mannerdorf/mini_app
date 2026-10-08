import React,{useState} from 'react';
import {groupPlannedCargo,type PlanningView,type SendingPlan} from './planningModel';
import {PlanningSortHeader,sortPlanningRows,type PlanningSort} from './PlanningSortHeader';
type Column='label'|'party'|'places'|'weight'|'volume'|'execution';
export const planningNumber=(number:number,digits=1)=>number.toLocaleString('ru-RU',{maximumFractionDigits:digits});
export function PlanningCargoTable({plan,view}:{plan:SendingPlan;view:PlanningView}) {
 const [sort,setSort]=useState<PlanningSort<Column>>({key:'label',direction:'asc'});
 const onSort=(key:Column)=>setSort(previous=>({key,direction:previous.key===key&&previous.direction==='asc'?'desc':'asc'}));
 const groups=sortPlanningRows(groupPlannedCargo(plan,view),sort,(group,key)=>{
  if(key==='party')return view==='cargo'?[group.cargo[0].customer,group.cargo[0].receiver]:[group.cargo.map(cargo=>cargo.number).join(', ')];
  if(key==='execution')return[group.actual/group.cargo.length,group.actual,group.cargo.length];
  return[group[key]];
 });
 return <div className="sending-planning__table-scroll"><table className="sending-planning__cargo-table">
  <thead><tr>{([['label',view==='cargo'?'Перевозка':view==='customer'?'Заказчик':'Получатель'],['party',view==='cargo'?'Заказчик / получатель':'Перевозки'],['places','Мест'],['weight','Вес, кг'],['volume','Объём, м³'],['execution','План / факт']] as [Column,string][]).map(([column,label])=><PlanningSortHeader key={column} column={column} label={label} sort={sort} onSort={onSort}/>)}</tr></thead>
  <tbody>{groups.map(group=><tr key={group.key}>
   <td><div className="sending-planning__table-cell" title={group.label}>{group.label}</div></td><td><div className="sending-planning__table-cell">{view==='cargo'?<>{group.cargo[0].customer}<small>{group.cargo[0].receiver}</small></>:group.cargo.map(cargo=>cargo.number).join(', ')}</div></td>
   <td>{planningNumber(group.places,0)}</td><td>{planningNumber(group.weight)}</td><td>{planningNumber(group.volume,2)}</td><td>{group.cargo.length} / {group.actual}</td>
  </tr>)}</tbody>
 </table>{!groups.length&&<p className="sending-planning__muted">Перевозки пока не добавлены</p>}</div>;
}
