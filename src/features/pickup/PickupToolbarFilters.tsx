import React, {useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {FilterDropdownPortal} from '../../components/ui/FilterDropdownPortal';
import {cities,type City} from '../../../lib/pickup/model';

export function PickupCityFilter({value,onChange}:{value:City;onChange:(city:City)=>void}) {
  const ref=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" ref={ref} className="filter-button" aria-expanded={open} onClick={()=>setOpen(!open)}>Город: {cities[value]} <ChevronDown size={16}/></button>
    <FilterDropdownPortal triggerRef={ref} isOpen={open} onClose={()=>setOpen(false)}>
      {Object.entries(cities).map(([id,name])=><button type="button" className="dropdown-item pk-city-option" aria-pressed={value===id} key={id} onClick={()=>{onChange(id as City);setOpen(false);}}>{name}</button>)}
    </FilterDropdownPortal>
  </>;
}

export function PickupDayFilter({value,onChange}:{value:string;onChange:(date:string)=>void}) {
  const ref=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" ref={ref} className="filter-button" aria-expanded={open} onClick={()=>setOpen(!open)}>Дата: {value.split('-').reverse().join('.')} <ChevronDown size={16}/></button>
    <FilterDropdownPortal triggerRef={ref} isOpen={open} onClose={()=>setOpen(false)}>
      <label className="pk-day-filter-field">Дата <input aria-label="Дата" type="date" value={value} onChange={e=>{if(e.target.value){onChange(e.target.value);setOpen(false);}}}/></label>
    </FilterDropdownPortal>
  </>;
}
