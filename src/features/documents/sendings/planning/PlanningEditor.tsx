import React,{useMemo,useState} from 'react';
import {Plus,Pencil} from 'lucide-react';
import {VEHICLES,type TmsCargo} from '../../../tms/model';
import {MODE_LABELS,planningVehicle,missingPlanFields,needsFerry,usesRoadVehicle,type PlanDraft,type PlanningMode,type SendingPlan} from './planningModel';
import {usePlanningToday} from './usePlanningToday';
import {PlanningReconciliation} from './PlanningReconciliation';
import {PlanningCargoPicker} from './PlanningCargoPicker';
import {PlanningSelectedCargo} from './PlanningSelectedCargo';
import {PlanningVehicleDimensions} from './PlanningVehicleDimensions';
import {PlanningLoadSummary} from './PlanningLoadSummary';
import {PlanningPeriodFilter,usePlanningPeriodFilter} from './PlanningPeriodFilter';
import {isDateInRange} from '../../../../lib/dateUtils';

export function PlanningEditor({draft,plan,available,ferries,routes,busy,dirty,onChange,onSave,onCancel,onDelete,onReconcile}:{
 draft:PlanDraft;plan?:SendingPlan;available:TmsCargo[];ferries:{id:number;name:string}[];routes:string[];busy:boolean;
 dirty:boolean;onChange:(draft:PlanDraft)=>void;onSave:()=>void;onCancel:()=>void;onDelete?:()=>void;onReconcile:(key:string)=>void;
}) {
 const [pickerOpen,setPickerOpen]=useState(false),[dimensionsOpen,setDimensionsOpen]=useState(false);
 const today=usePlanningToday(),past=draft.date<today,closed=!!plan?.reconciliation;
 const preset=VEHICLES.find(vehicle=>vehicle.id===draft.vehicleId),vehicle=planningVehicle(draft);
 const period=usePlanningPeriodFilter();
 const all=useMemo(()=>[...new Map([...available,...(plan?.cargo||[])].map(cargo=>[cargo.number,cargo])).values()],[available,plan]);
 const byNumber=useMemo(()=>new Map(all.map(cargo=>[cargo.number,cargo])),[all]);
 const actual=new Set(plan?.actualCargoNumbers||[]);
 const selected=draft.cargoNumbers.map(number=>byNumber.get(number)).filter((cargo):cargo is TmsCargo=>!!cargo);
 const candidates=useMemo(()=>all.filter(cargo=>cargo.route===draft.route&&(period.state.dateFilter==='все'||isDateInRange(cargo.received,period.range.dateFrom,period.range.dateTo))),[all,draft.route,period.state.dateFilter,period.range.dateFrom,period.range.dateTo]);
 const partial=!!plan?.isDraft,missing=missingPlanFields(draft);
 const road=usesRoadVehicle(draft.mode),showFerry=needsFerry(draft.mode)||partial&&!draft.mode;
 const changeMode=(mode:PlanningMode)=>{
  const presets=VEHICLES.filter(vehicle=>vehicle.mode===(usesRoadVehicle(mode)?'road':'ferry'));
  const vehicleId=mode==='air'||!mode?'':presets.some(vehicle=>vehicle.id===draft.vehicleId)?draft.vehicleId:presets[0].id;
  onChange({...draft,mode,vehicleId,vehicleDimensions:vehicleId===draft.vehicleId?draft.vehicleDimensions:null,ferryId:needsFerry(mode)||!mode?draft.ferryId:null,departureDate:needsFerry(mode)||!mode?draft.departureDate:''});
 };
 const select=(numbers:string[],include:boolean)=>{
  if(closed||include&&past)return;
  const editable=new Set(numbers.filter(number=>!actual.has(number)));
  onChange({...draft,cargoNumbers:include?[...new Set([...draft.cargoNumbers,...editable])]:draft.cargoNumbers.filter(number=>!editable.has(number))});
 };
 return <form className="sending-planning__editor" onSubmit={event=>{event.preventDefault();onSave();}}>
  <fieldset disabled={busy}>
   {plan&&(plan.date<today||closed)&&<PlanningReconciliation plan={plan} disabled={busy} dirty={dirty} onReconcile={onReconcile}/>}
   {partial&&missing.length>0&&<p className="sending-planning__draft-notice">Черновик из Битрикса. Заполните: {missing.join(', ')}.</p>}
   <section className="sending-planning__form-section" aria-labelledby="planning-parameters">
    <h4 id="planning-parameters" className="sending-planning__section-heading"><span>1</span>Параметры отправки</h4>
    <fieldset className="sending-planning__fields" disabled={closed}>
     <label>Дата планирования<input required type="date" aria-label="Дата планирования" min={!plan||plan.date>=today?today:undefined} value={draft.date} onChange={event=>onChange({...draft,date:event.target.value})}/></label>
     <label>Маршрут<select required={!partial} aria-label="Маршрут" value={draft.route} disabled={actual.size>0} onChange={event=>onChange({...draft,route:event.target.value,cargoNumbers:draft.cargoNumbers.filter(number=>byNumber.get(number)?.route===event.target.value)})}>{partial&&<option value="">Выберите маршрут</option>}{routes.map(route=><option key={route}>{route}</option>)}</select></label>
     <label>Тип транспорта<select aria-label="Тип транспорта" value={draft.mode} onChange={event=>changeMode(event.target.value as PlanningMode)}>{partial&&<option value="">Выберите тип транспорта</option>}{Object.entries(MODE_LABELS).filter(([mode])=>!!mode).map(([mode,label])=><option key={mode} value={mode}>{label}</option>)}</select></label>
     {draft.mode&&draft.mode!=='air'&&<label><span className="sending-planning__vehicle-label">{road?'Тип ТС':'Тип контейнера'}<button type="button" className="sending-planning__icon" disabled={!preset} aria-label="Изменить внутренние размеры ТС" aria-controls="planning-vehicle-dimensions" aria-expanded={dimensionsOpen} onClick={()=>setDimensionsOpen(open=>!open)}><Pencil size={16}/></button></span><select required={!partial} aria-label={road?'Тип ТС':'Тип контейнера'} value={draft.vehicleId} onChange={event=>onChange({...draft,vehicleId:event.target.value,vehicleDimensions:null})}>{partial&&<option value="">{road?'Выберите тип ТС':'Выберите тип контейнера'}</option>}{VEHICLES.filter(vehicle=>vehicle.mode===(road?'road':'ferry')).map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}</select></label>}
     {dimensionsOpen&&preset&&draft.mode&&draft.mode!=='air'&&<PlanningVehicleDimensions draft={draft} preset={preset} onChange={onChange}/>}
     {showFerry&&<>
      <label>Паром<select required={!partial} aria-label="Паром" value={draft.ferryId||''} onChange={event=>onChange({...draft,ferryId:event.target.value?Number(event.target.value):null})}><option value="">Выберите паром</option>{ferries.map(ferry=><option key={ferry.id} value={ferry.id}>{ferry.name}</option>)}{plan?.ferryId&&!ferries.some(ferry=>ferry.id===plan.ferryId)&&<option value={plan.ferryId}>{plan.ferryName} (неактивен)</option>}</select></label>
      <label>Дата выхода<input type="date" aria-label="Дата выхода парома" value={draft.departureDate||''} onChange={event=>onChange({...draft,departureDate:event.target.value})}/></label>
     </>}
    </fieldset>
   </section>
   <PlanningLoadSummary cargo={plan?.reconciliation?.originalCargo||selected} draft={draft}/>
   {!closed&&<section className="sending-planning__form-section sending-planning__form-section--pick" aria-labelledby="planning-pick">
    <h4 id="planning-pick" className="sending-planning__section-heading"><span>3</span>Подбор перевозок</h4>
    <PlanningPeriodFilter filter={period}/>
    {past&&<p className="sending-planning__draft-notice">На прошедшие даты нельзя добавлять перевозки. Выберите сегодняшнюю или будущую дату.</p>}
    <div className="sending-planning__cargo-heading"><span>По выбранному маршруту и периоду</span><button type="button" className="button-primary" disabled={!draft.route||past} onClick={()=>setPickerOpen(open=>!open)} aria-expanded={pickerOpen&&!past}><Plus size={16}/> Добавить перевозку</button></div>
    {pickerOpen&&!past&&<PlanningCargoPicker candidates={candidates} selectedCargo={selected} vehicle={vehicle} cargoNumbers={draft.cargoNumbers} locked={actual} initialSlaCutoff={draft.departureDate||draft.date} onSelect={select}/>}
   </section>}
   <PlanningSelectedCargo draft={draft} cargo={plan?.reconciliation?.originalCargo||selected} actual={actual} readOnly={closed} released={plan?.reconciliation?.releasedCargoNumbers} otherActual={plan?.reconciliation?.otherActualCargoNumbers} ferryName={draft.ferryId?ferries.find(ferry=>ferry.id===draft.ferryId)?.name||(plan?.ferryId===draft.ferryId?plan.ferryName:''):''} onRemove={numbers=>select(numbers,false)}/>
   <section className="sending-planning__form-section" aria-labelledby="planning-comment">
    <h4 id="planning-comment" className="sending-planning__section-heading"><span>5</span>Комментарий</h4>
    <textarea aria-label="Комментарий" maxLength={4000} rows={3} value={draft.comment} onChange={event=>onChange({...draft,comment:event.target.value})} placeholder="Указания кладовщику"/>
   </section>
  </fieldset>
  <footer>{onDelete&&!closed&&<button type="button" className="sending-planning__delete" disabled={busy} onClick={onDelete}>Удалить план</button>}<span/><button type="button" className="filter-button" disabled={busy} onClick={onCancel}>Отмена</button><button type="submit" className="button-primary" disabled={busy||!draft.date||!!draft.vehicleDimensions&&!vehicle||(!partial&&needsFerry(draft.mode)&&!draft.ferryId)}>{busy?'Сохраняем…':'Сохранить'}</button></footer>
 </form>;
}
