import React,{useMemo,useState} from 'react';
import {ChevronDown,Download,ListX,Loader2,Trash2} from 'lucide-react';
import type {TmsCargo} from '../../../tms/model';
import type {PlanDraft} from './planningModel';
import {PICKER_VIEWS,groupPickerHierarchy,receiptDateLabel,type PlanningPickerView,type PlanningPickerGroup} from './planningPickerModel';
import {planningNumber} from './PlanningCargoTable';
import {saveBlobFile} from '../../../../lib/saveBlobFile';
function SelectedRow({cargo,actual,onRemove}:{cargo:TmsCargo;actual:Set<string>;onRemove:(numbers:string[])=>void}) {
 return <div className="sending-planning__selected-row"><span><b>{cargo.number}</b> · {cargo.customer}<small>{cargo.receiver} · {receiptDateLabel(cargo.received)}{actual.has(cargo.number)?' · Отправлена по данным 1С':''}</small>{cargo.slaDeadline&&<small>Срок по SLA: {receiptDateLabel(cargo.slaDeadline.slice(0,10))}</small>}<small>{cargo.weight==null?'Вес не указан':`${planningNumber(cargo.weight)} кг`} · {cargo.volume==null?'Объём не указан':`${planningNumber(cargo.volume,2)} м³`}</small></span>{!actual.has(cargo.number)&&<button type="button" className="sending-planning__icon" aria-label={`Убрать перевозку ${cargo.number}`} onClick={()=>onRemove([cargo.number])}><Trash2 size={16}/></button>}</div>;
}
function SelectedGroup({group,actual,onRemove}:{group:PlanningPickerGroup;actual:Set<string>;onRemove:(numbers:string[])=>void}) {
 return <details className="sending-planning__picker-group" open><summary><span><b>{group.label}</b><small>{group.cargo.length} перев. · {planningNumber(group.weight)} кг · {planningNumber(group.volume,2)} м³</small></span><ChevronDown size={16}/></summary><div className="sending-planning__picker-children">{group.children?group.children.map(child=><SelectedGroup key={child.key} group={child} actual={actual} onRemove={onRemove}/>):group.cargo.map(cargo=><SelectedRow key={cargo.number} cargo={cargo} actual={actual} onRemove={onRemove}/>)}</div></details>;
}
export function PlanningSelectedCargo({draft,cargo,actual,ferryName,onRemove}:{draft:PlanDraft;cargo:TmsCargo[];actual:Set<string>;ferryName:string;onRemove:(numbers:string[])=>void}) {
 const [view,setView]=useState<PlanningPickerView>('cargo'),[exporting,setExporting]=useState(false),[error,setError]=useState('');
 const groups=useMemo(()=>view==='cargo'?[]:groupPickerHierarchy(cargo,view),[cargo,view]);
 const download=async()=>{
  setExporting(true);setError('');
  try{const {createPlanningExcel}=await import('./planningExcel');const blob=await createPlanningExcel({draft,cargo,actual,ferryName,view});await saveBlobFile(blob,`План_отправки_${draft.date}_${view}.xlsx`);}
  catch(reason){setError(reason instanceof Error?reason.message:'Не удалось скачать Excel');}finally{setExporting(false);}
 };
 return <section className="sending-planning__form-section" aria-labelledby="planning-selected">
  <div className="sending-planning__selected-heading"><h4 id="planning-selected" className="sending-planning__section-heading"><span>4</span>Выбранные перевозки · {cargo.length}</h4><div className="sending-planning__selected-actions"><button type="button" className="sending-planning__icon" aria-label="Очистить выбранные перевозки" title="Очистить выбранные перевозки; уже отправленные сохранятся" disabled={!draft.cargoNumbers.some(number=>!actual.has(number))} onClick={()=>onRemove(draft.cargoNumbers)}><ListX size={19}/></button><button type="button" className="sending-planning__icon" aria-label="Скачать выбранные перевозки в Excel" title="Скачать выбранные перевозки в Excel" disabled={exporting||!cargo.length} onClick={()=>void download()}>{exporting?<Loader2 size={19} className="animate-spin"/>:<Download size={19}/>}</button></div></div>
  <div className="sending-planning__tabs sending-planning__picker-views" role="group" aria-label="Отображение выбранных перевозок">{PICKER_VIEWS.map(item=><button type="button" key={item.value} aria-pressed={view===item.value} onClick={()=>setView(item.value)}>{item.label}</button>)}</div>
  {error&&<p className="sending-planning__error" role="alert">{error}</p>}
  <div className="sending-planning__selected">{view==='cargo'?cargo.map(item=><SelectedRow key={item.number} cargo={item} actual={actual} onRemove={onRemove}/>):groups.map(group=><SelectedGroup key={`${view}:${group.key}`} group={group} actual={actual} onRemove={onRemove}/>)}</div>
  {!cargo.length&&<p className="sending-planning__muted">Добавьте перевозки в блоке подбора</p>}
 </section>;
}
