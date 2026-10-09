import React,{useMemo,useState} from 'react';
import {ChevronDown,Download,Loader2,Trash2} from 'lucide-react';
import type {TmsCargo} from '../../../tms/model';
import type {PlanDraft} from './planningModel';
import {groupPickerHierarchy,receiptDateLabel,type PlanningPickerView,type PlanningPickerGroup} from './planningPickerModel';
import {PlanningCargoViews} from './PlanningCargoViews';
import {PlanningClearSelection} from './PlanningClearSelection';
import {planningNumber} from './PlanningCargoTable';
import {saveBlobFile} from '../../../../lib/saveBlobFile';
type SelectedState={actual:Set<string>;readOnly:boolean;released:Set<string>;otherActual:Set<string>;onRemove:(numbers:string[])=>void};
function SelectedRow({cargo,actual,readOnly,released,otherActual,onRemove}:SelectedState&{cargo:TmsCargo}) {
 const status=released.has(cargo.number)?'Освобождена для другого дня':otherActual.has(cargo.number)?'Отправлена другой отправкой 1С':actual.has(cargo.number)?'Отправлена по данным 1С':'';
 return <div className="sending-planning__selected-row"><span><b>{cargo.number}</b> · {cargo.customer}<small>{cargo.receiver} · {receiptDateLabel(cargo.received)}{status?` · ${status}`:''}</small>{cargo.slaDeadline&&<small>Срок по SLA: {receiptDateLabel(cargo.slaDeadline.slice(0,10))}</small>}<small>{cargo.weight==null?'Вес не указан':`${planningNumber(cargo.weight)} кг`} · {cargo.volume==null?'Объём не указан':`${planningNumber(cargo.volume,2)} м³`}</small></span>{!readOnly&&!actual.has(cargo.number)&&<button type="button" className="sending-planning__icon" aria-label={`Убрать перевозку ${cargo.number}`} onClick={()=>onRemove([cargo.number])}><Trash2 size={16}/></button>}</div>;
}
function SelectedGroup({group,...state}:SelectedState&{group:PlanningPickerGroup}) {
 return <details className="sending-planning__picker-group"><summary><span><b>{group.label}</b><small>{group.cargo.length} перев. · {planningNumber(group.weight)} кг · {planningNumber(group.volume,2)} м³</small></span><ChevronDown size={16}/></summary><div className="sending-planning__picker-children">{group.children?group.children.map(child=><SelectedGroup key={child.key} group={child} {...state}/>):group.cargo.map(cargo=><SelectedRow key={cargo.number} cargo={cargo} {...state}/>)}</div></details>;
}
export function PlanningSelectedCargo({draft,cargo,actual,ferryName,onRemove,readOnly=false,released=[],otherActual=[]}:{draft:PlanDraft;cargo:TmsCargo[];actual:Set<string>;ferryName:string;onRemove:(numbers:string[])=>void;readOnly?:boolean;released?:string[];otherActual?:string[]}) {
 const state={actual,readOnly,released:new Set(released),otherActual:new Set(otherActual),onRemove};
 const [view,setView]=useState<PlanningPickerView>('customer'),[exporting,setExporting]=useState(false),[error,setError]=useState('');
 const groups=useMemo(()=>view==='cargo'?[]:groupPickerHierarchy(cargo,view),[cargo,view]);
 const download=async()=>{
  setExporting(true);setError('');
  try{const {createPlanningExcel}=await import('./planningExcel');const blob=await createPlanningExcel({draft,cargo,actual,ferryName,view});await saveBlobFile(blob,`План_отправки_${draft.date}_${view}.xlsx`);}
  catch(reason){setError(reason instanceof Error?reason.message:'Не удалось скачать Excel');}finally{setExporting(false);}
 };
 return <section className="sending-planning__form-section" aria-labelledby="planning-selected">
  <div className="sending-planning__selected-heading"><h4 id="planning-selected" className="sending-planning__section-heading"><span>4</span>{readOnly?'Исходный состав':'Выбранные перевозки'} · {cargo.length}</h4><div className="sending-planning__selected-actions">{!readOnly&&<PlanningClearSelection disabled={!draft.cargoNumbers.some(number=>!actual.has(number))} onClear={()=>onRemove(draft.cargoNumbers)}/>}<button type="button" className="sending-planning__icon" aria-label="Скачать выбранные перевозки в Excel" title="Скачать выбранные перевозки в Excel" disabled={exporting||!cargo.length} onClick={()=>void download()}>{exporting?<Loader2 size={19} className="animate-spin"/>:<Download size={19}/>}</button></div></div>
  <PlanningCargoViews view={view} onChange={setView} label="Отображение выбранных перевозок"/>
  {error&&<p className="sending-planning__error" role="alert">{error}</p>}
  <div className="sending-planning__selected">{view==='cargo'?cargo.map(item=><SelectedRow key={item.number} cargo={item} {...state}/>):groups.map(group=><SelectedGroup key={`${view}:${group.key}`} group={group} {...state}/>)}</div>
  {!cargo.length&&<p className="sending-planning__muted">Добавьте перевозки в блоке подбора</p>}
 </section>;
}
