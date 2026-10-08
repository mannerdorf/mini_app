import React,{useMemo,useState} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {VEHICLES,type TmsCargo} from '../../../tms/model';
import {MODE_LABELS,missingPlanFields,needsFerry,usesRoadVehicle,type PlanDraft,type PlanningMode,type SendingPlan} from './planningModel';
import {PlanningCargoPicker} from './PlanningCargoPicker';
import {PlanningLoadSummary} from './PlanningLoadSummary';
import {matchesPickerSearch} from './planningPickerModel';
import {PlanningPeriodFilter,usePlanningPeriodFilter} from './PlanningPeriodFilter';
import {isDateInRange} from '../../../../lib/dateUtils';

export function PlanningEditor({draft,plan,available,ferries,routes,busy,onChange,onSave,onCancel,onDelete}:{
 draft:PlanDraft;plan?:SendingPlan;available:TmsCargo[];ferries:{id:number;name:string}[];routes:string[];busy:boolean;
 onChange:(draft:PlanDraft)=>void;onSave:()=>void;onCancel:()=>void;onDelete?:()=>void;
}) {
 const [pickerOpen,setPickerOpen]=useState(false),[search,setSearch]=useState('');
 const period=usePlanningPeriodFilter();
 const all=useMemo(()=>[...new Map([...available,...(plan?.cargo||[])].map(cargo=>[cargo.number,cargo])).values()],[available,plan]);
 const byNumber=useMemo(()=>new Map(all.map(cargo=>[cargo.number,cargo])),[all]);
 const actual=new Set(plan?.actualCargoNumbers||[]);
 const selected=draft.cargoNumbers.map(number=>byNumber.get(number)).filter((cargo):cargo is TmsCargo=>!!cargo);
 const candidates=useMemo(()=>all.filter(cargo=>cargo.route===draft.route&&matchesPickerSearch(cargo,search)&&(period.state.dateFilter==='все'||isDateInRange(cargo.received,period.range.dateFrom,period.range.dateTo))),[all,draft.route,search,period.state.dateFilter,period.range.dateFrom,period.range.dateTo]);
 const partial=!!plan?.isDraft,missing=missingPlanFields(draft);
 const road=usesRoadVehicle(draft.mode),showFerry=needsFerry(draft.mode)||partial&&!draft.mode;
 const changeMode=(mode:PlanningMode)=>{
  const presets=VEHICLES.filter(vehicle=>vehicle.mode===(usesRoadVehicle(mode)?'road':'ferry'));
  onChange({...draft,mode,vehicleId:mode==='air'||!mode?'':presets.some(vehicle=>vehicle.id===draft.vehicleId)?draft.vehicleId:presets[0].id,ferryId:needsFerry(mode)||!mode?draft.ferryId:null});
 };
 const select=(numbers:string[],include:boolean)=>{
  const editable=new Set(numbers.filter(number=>!actual.has(number)));
  onChange({...draft,cargoNumbers:include?[...new Set([...draft.cargoNumbers,...editable])]:draft.cargoNumbers.filter(number=>!editable.has(number))});
 };
 const toggle=(number:string)=>select([number],!draft.cargoNumbers.includes(number));
 return <form className="sending-planning__editor" onSubmit={event=>{event.preventDefault();onSave();}}>
  <fieldset disabled={busy}>
   {partial&&missing.length>0&&<p className="sending-planning__draft-notice">Черновик из Битрикса. Заполните: {missing.join(', ')}.</p>}
   <div className="sending-planning__fields">
    {(plan?.title||partial)&&<label className="sending-planning__title-field">Название<input type="text" aria-label="Название плана" maxLength={200} required={partial} value={draft.title||''} onChange={event=>onChange({...draft,title:event.target.value})}/></label>}
    <label>Дата планирования<input required type="date" aria-label="Дата планирования" value={draft.date} onChange={event=>onChange({...draft,date:event.target.value})}/></label>
    <label>Маршрут<select required={!partial} aria-label="Маршрут" value={draft.route} disabled={actual.size>0} onChange={event=>onChange({...draft,route:event.target.value,cargoNumbers:draft.cargoNumbers.filter(number=>byNumber.get(number)?.route===event.target.value)})}>{partial&&<option value="">Выберите маршрут</option>}{routes.map(route=><option key={route}>{route}</option>)}</select></label>
    <label>Тип транспорта<select aria-label="Тип транспорта" value={draft.mode} onChange={event=>changeMode(event.target.value as PlanningMode)}>{partial&&<option value="">Выберите тип транспорта</option>}{Object.entries(MODE_LABELS).filter(([mode])=>!!mode).map(([mode,label])=><option key={mode} value={mode}>{label}</option>)}</select></label>
    {draft.mode&&draft.mode!=='air'&&<label>{road?'Тип ТС':'Тип контейнера'}<select required={!partial} aria-label={road?'Тип ТС':'Тип контейнера'} value={draft.vehicleId} onChange={event=>onChange({...draft,vehicleId:event.target.value})}>{partial&&<option value="">{road?'Выберите тип ТС':'Выберите тип контейнера'}</option>}{VEHICLES.filter(vehicle=>vehicle.mode===(road?'road':'ferry')).map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>}
    {showFerry&&<label>Паром<select required={!partial} aria-label="Паром" value={draft.ferryId||''} onChange={event=>onChange({...draft,ferryId:event.target.value?Number(event.target.value):null})}><option value="">Выберите паром</option>{ferries.map(ferry=><option key={ferry.id} value={ferry.id}>{ferry.name}</option>)}{plan?.ferryId&&!ferries.some(ferry=>ferry.id===plan.ferryId)&&<option value={plan.ferryId}>{plan.ferryName} (неактивен)</option>}</select></label>}
    <PlanningPeriodFilter filter={period}/>
   </div>
   <div className="sending-planning__cargo-heading"><h4>Перевозки · {selected.length}</h4><button type="button" className="filter-button" disabled={!draft.route} onClick={()=>setPickerOpen(open=>!open)} aria-expanded={pickerOpen}><Plus size={16}/> Добавить перевозку</button></div>
   <PlanningLoadSummary cargo={selected} draft={draft}/>
   {pickerOpen&&<PlanningCargoPicker candidates={candidates} cargoNumbers={draft.cargoNumbers} locked={actual} search={search} onSearch={setSearch} onSelect={select}/>}
   <div className="sending-planning__selected">{selected.map(cargo=><div key={cargo.number}><span><b>{cargo.number}</b> · {cargo.customer}<small>{cargo.receiver}{actual.has(cargo.number)?' · Отправлена по данным 1С':''}</small></span>{!actual.has(cargo.number)&&<button type="button" className="sending-planning__icon" aria-label={`Убрать перевозку ${cargo.number}`} onClick={()=>toggle(cargo.number)}><Trash2 size={16}/></button>}</div>)}</div>
   <label>Комментарий<textarea aria-label="Комментарий" maxLength={4000} rows={3} value={draft.comment} onChange={event=>onChange({...draft,comment:event.target.value})} placeholder="Указания кладовщику"/></label>
  </fieldset>
  <footer>{onDelete&&<button type="button" className="sending-planning__delete" disabled={busy} onClick={onDelete}>Удалить план</button>}<span/><button type="button" className="filter-button" disabled={busy} onClick={onCancel}>Отмена</button><button type="submit" className="button-primary" disabled={busy||!draft.date||(!partial&&needsFerry(draft.mode)&&!draft.ferryId)}>{busy?'Сохраняем…':partial&&missing.length?'Сохранить черновик':'Сохранить план'}</button></footer>
 </form>;
}
