import React from 'react';
import {groupPlannedCargo,type PlanningView,type SendingPlan} from './planningModel';
export const planningNumber=(number:number,digits=1)=>number.toLocaleString('ru-RU',{maximumFractionDigits:digits});
export function PlanningCargoTable({plan,view}:{plan:SendingPlan;view:PlanningView}) {
 const groups=groupPlannedCargo(plan,view);
 return <div className="sending-planning__table-scroll"><table className="sending-planning__cargo-table">
  <thead><tr><th>{view==='cargo'?'Перевозка':view==='customer'?'Заказчик':'Получатель'}</th><th>{view==='cargo'?'Заказчик / получатель':'Перевозки'}</th><th>Мест</th><th>Вес, кг</th><th>Объём, м³</th><th>План / факт</th></tr></thead>
  <tbody>{groups.map(group=><tr key={group.key}>
   <td>{group.label}</td><td>{view==='cargo'?<>{group.cargo[0].customer}<small>{group.cargo[0].receiver}</small></>:group.cargo.map(cargo=>cargo.number).join(', ')}</td>
   <td>{planningNumber(group.places,0)}</td><td>{planningNumber(group.weight)}</td><td>{planningNumber(group.volume,2)}</td><td>{group.cargo.length} / {group.actual}</td>
  </tr>)}</tbody>
 </table>{!groups.length&&<p className="sending-planning__muted">Перевозки пока не добавлены</p>}</div>;
}
