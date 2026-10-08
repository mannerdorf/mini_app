import React,{useMemo,useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {VEHICLES,type TmsCargo} from '../../../tms/model';
import {MODE_LABELS,type PlanDraft,type PlanningMode,type SendingPlan} from './planningModel';
import {planningNumber} from './PlanningCargoTable';
import {PlanningCargoPicker} from './PlanningCargoPicker';
import {matchesPickerSearch} from './planningPickerModel';

export function PlanningEditor({draft,plan,available,ferries,routes,busy,onChange,onSave,onCancel,onDelete}:{
 draft:PlanDraft;plan?:SendingPlan;available:TmsCargo[];ferries:{id:number;name:string}[];routes:string[];busy:boolean;
 onChange:(draft:PlanDraft)=>void;onSave:()=>void;onCancel:()=>void;onDelete?:()=>void;
}) {
 const [pickerOpen,setPickerOpen]=useState(false),[search,setSearch]=useState('');
 const all=useMemo(()=>[...new Map([...available,...(plan?.cargo||[])].map(cargo=>[cargo.number,cargo])).values()],[available,plan]);
 const byNumber=useMemo(()=>new Map(all.map(cargo=>[cargo.number,cargo])),[all]);
 const actual=new Set(plan?.actualCargoNumbers||[]);
 const selected=draft.cargoNumbers.map(number=>byNumber.get(number)).filter((cargo):cargo is TmsCargo=>!!cargo);
 const candidates=useMemo(()=>all.filter(cargo=>cargo.route===draft.route&&matchesPickerSearch(cargo,search)),[all,draft.route,search]);
 const changeMode=(mode:PlanningMode)=>onChange({...draft,mode,vehicleId:mode==='air'?'':VEHICLES.find(vehicle=>vehicle.mode===(mode==='auto'?'road':'ferry'))!.id,ferryId:null});
 const select=(numbers:string[],include:boolean)=>{
  const editable=new Set(numbers.filter(number=>!actual.has(number)));
  onChange({...draft,cargoNumbers:include?[...new Set([...draft.cargoNumbers,...editable])]:draft.cargoNumbers.filter(number=>!editable.has(number))});
 };
 const toggle=(number:string)=>select([number],!draft.cargoNumbers.includes(number));
 const total=(field:'weight'|'volume'|'places')=>selected.reduce((sum,cargo)=>sum+(cargo[field]||0),0);
 return <form className="sending-planning__editor" onSubmit={event=>{event.preventDefault();onSave();}}>
  <header><div><h3>{plan?'План отправки':'Новый план отправки'}</h3><p>Рекомендация кладовщику</p></div></header>
  <fieldset disabled={busy}>
   <div className="sending-planning__fields">
    <label>Дата планирования<input required type="date" aria-label="Дата планирования" value={draft.date} onChange={event=>onChange({...draft,date:event.target.value})}/></label>
    <label>Маршрут<select required aria-label="Маршрут" value={draft.route} disabled={actual.size>0} onChange={event=>onChange({...draft,route:event.target.value,cargoNumbers:draft.cargoNumbers.filter(number=>byNumber.get(number)?.route===event.target.value)})}>{routes.map(route=><option key={route}>{route}</option>)}</select></label>
    <label>Тип транспорта<select aria-label="Тип транспорта" value={draft.mode} onChange={event=>changeMode(event.target.value as PlanningMode)}>{Object.entries(MODE_LABELS).map(([mode,label])=><option key={mode} value={mode}>{label}</option>)}</select></label>
    {draft.mode!=='air'&&<label>{draft.mode==='auto'?'Тип ТС':'Тип контейнера'}<select required aria-label={draft.mode==='auto'?'Тип ТС':'Тип контейнера'} value={draft.vehicleId} onChange={event=>onChange({...draft,vehicleId:event.target.value})}>{VEHICLES.filter(vehicle=>vehicle.mode===(draft.mode==='auto'?'road':'ferry')).map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>}
    {draft.mode==='ferry'&&<label>Паром<select required aria-label="Паром" value={draft.ferryId||''} onChange={event=>onChange({...draft,ferryId:event.target.value?Number(event.target.value):null})}><option value="">Выберите паром</option>{ferries.map(ferry=><option key={ferry.id} value={ferry.id}>{ferry.name}</option>)}{plan?.ferryId&&!ferries.some(ferry=>ferry.id===plan.ferryId)&&<option value={plan.ferryId}>{plan.ferryName} (неактивен)</option>}</select></label>}
   </div>
   <div className="sending-planning__cargo-heading"><h4>Перевозки · {selected.length}</h4><button type="button" className="filter-button" onClick={()=>setPickerOpen(open=>!open)} aria-expanded={pickerOpen}><Plus size={16}/> Добавить перевозку</button></div>
   {pickerOpen&&<PlanningCargoPicker candidates={candidates} cargoNumbers={draft.cargoNumbers} locked={actual} search={search} onSearch={setSearch} onSelect={select}/>}
   <div className="sending-planning__selected">{selected.map(cargo=><div key={cargo.number}><span><b>{cargo.number}</b> · {cargo.customer}<small>{cargo.receiver}{actual.has(cargo.number)?' · Отправлена по данным 1С':''}</small></span>{!actual.has(cargo.number)&&<button type="button" className="sending-planning__icon" aria-label={`Убрать перевозку ${cargo.number}`} onClick={()=>toggle(cargo.number)}><Trash2 size={16}/></button>}</div>)}</div>
   <p className="sending-planning__totals">{planningNumber(total('places'),0)} мест · {planningNumber(total('weight'))} кг · {planningNumber(total('volume'),2)} м³</p>
   <label>Комментарий<textarea maxLength={4000} rows={3} value={draft.comment} onChange={event=>onChange({...draft,comment:event.target.value})} placeholder="Указания кладовщику"/></label>
  </fieldset>
  <footer>{onDelete&&<button type="button" className="sending-planning__delete" disabled={busy} onClick={onDelete}>Удалить план</button>}<span/><button type="button" className="filter-button" disabled={busy} onClick={onCancel}>Отмена</button><button type="submit" className="button-primary" disabled={busy||!draft.date||(draft.mode==='ferry'&&!draft.ferryId)}>{busy?'Сохраняем…':'Сохранить план'}</button></footer>
 </form>;
}
