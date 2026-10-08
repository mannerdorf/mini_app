import React from 'react';
import {ArrowDown,ArrowUp,ArrowUpDown} from 'lucide-react';
export type PlanningSort<K extends string>={key:K;direction:'asc'|'desc'};
export function PlanningSortHeader<K extends string>({label,column,sort,onSort}:{label:string;column:K;sort:PlanningSort<K>;onSort:(column:K)=>void}) {
 const active=sort.key===column,Icon=active?sort.direction==='asc'?ArrowUp:ArrowDown:ArrowUpDown;
 return <th aria-sort={active?sort.direction==='asc'?'ascending':'descending':'none'}><button type="button" className="sending-planning__sort" onClick={()=>onSort(column)} title={`Сортировать: ${label}`}><span>{label}</span><Icon size={13} aria-hidden="true"/></button></th>;
}
export function sortPlanningRows<T,K extends string>(rows:T[],sort:PlanningSort<K>,value:(row:T,key:K)=>(string|number)[]):T[] {
 return [...rows].sort((a,b)=>{
  const first=value(a,sort.key),second=value(b,sort.key);
  for(let index=0;index<first.length;index++){
   const left=first[index],right=second[index],comparison=typeof left==='number'&&typeof right==='number'?left-right:String(left).localeCompare(String(right),'ru',{numeric:true,sensitivity:'base'});
   if(comparison)return sort.direction==='asc'?comparison:-comparison;
  }
  return 0;
 });
}
