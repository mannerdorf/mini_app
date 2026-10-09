import React from 'react';
import {Building2,Boxes,UserRoundCheck,CalendarDays} from 'lucide-react';
import {PICKER_VIEWS,type PlanningPickerView} from './planningPickerModel';

const views={
 customer:{icon:Building2,description:'Группы заказчиков, внутри — даты поступления'},
 cargo:{icon:Boxes,description:'Общий список перевозок без группировки'},
 receiver:{icon:UserRoundCheck,description:'Группы получателей, внутри — даты поступления'},
 date:{icon:CalendarDays,description:'Даты поступления на склад, внутри — заказчики'},
};

export function PlanningCargoViews({view,onChange,label}:{view:PlanningPickerView;onChange:(view:PlanningPickerView)=>void;label:string}) {
 return <div className="sending-planning__tabs sending-planning__picker-views" role="group" aria-label={label}>
  {PICKER_VIEWS.map(item=>{
   const {icon:Icon,description}=views[item.value];
   return <button type="button" key={item.value} aria-label={item.label} aria-pressed={view===item.value} title={`${item.label} · ${description}`} onClick={()=>onChange(item.value)}><Icon size={20} aria-hidden="true"/></button>;
  })}
 </div>;
}
