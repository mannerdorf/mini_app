import React from 'react';
import type {Vehicle} from '../../../tms/model';
import type {PlanDraft,VehicleDimensions} from './planningModel';
import {planningNumber} from './PlanningCargoTable';

export function PlanningVehicleDimensions({draft,preset,onChange}:{draft:PlanDraft;preset:Vehicle;onChange:(draft:PlanDraft)=>void}) {
 const dimensions=draft.vehicleDimensions||preset.compartments[0];
 const count=preset.compartments.length;
 return <div id="planning-vehicle-dimensions" className="sending-planning__dimensions" role="group" aria-label="Внутренние размеры ТС">
  <div className="sending-planning__dimension-fields">{(['length','width','height'] as const).map(key=><label key={key}>{key==='length'?'Длина, м':key==='width'?'Ширина, м':'Высота, м'}<input type="number" min="0.01" max="100" step="0.01" required aria-label={key==='length'?'Внутренняя длина ТС, м':key==='width'?'Внутренняя ширина ТС, м':'Внутренняя высота ТС, м'} value={dimensions[key]||''} onChange={event=>onChange({...draft,vehicleDimensions:{length:dimensions.length,width:dimensions.width,height:dimensions.height,[key]:Number(event.target.value)} as VehicleDimensions})}/></label>)}</div>
  <p className="sending-planning__muted">Внутренний объём: {planningNumber(dimensions.length*dimensions.width*dimensions.height*count,2)} м³{count>1?` · ${count} кузова с одинаковыми размерами`:''}</p>
  {draft.vehicleDimensions&&<button type="button" className="sending-planning__link" onClick={()=>onChange({...draft,vehicleDimensions:null})}>По справочнику ТМС</button>}
 </div>;
}
