import React,{useState} from 'react';
import type {SendingPlan} from './planningModel';
const dateLabel=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU');
export function PlanningReconciliation({plan,disabled,dirty,onReconcile}:{plan:SendingPlan;disabled:boolean;dirty:boolean;onReconcile:(key:string)=>void}) {
 const [selected,setSelected]=useState('');
 const check=plan.reconciliation,candidates=plan.factCandidates||[],candidate=candidates.find(item=>item.key===selected);
 return <section className="sending-planning__form-section sending-planning__reconciliation" aria-label="Сверка плана с фактом">
  <h4>План / факт</h4>
  {check?<>
   <p>Сверено с отправкой {check.sending.number} от {dateLabel(check.sending.date)}.</p>
   <p>План: {check.originalCargo.length} · факт: {check.actualCargoNumbers.length} · освобождено для другого дня: {check.releasedCargoNumbers.length}.</p>
   {check.otherActualCargoNumbers.length>0&&<p>В других отправках: {check.otherActualCargoNumbers.length}. Они остаются в истории и недоступны для повторного планирования.</p>}
   <small>Исходный состав сохранён. Можно изменить комментарий.</small>
  </>:candidates.length>0?<>
   <p>{candidates.length>1?'Найдено несколько отправок с перевозками этого плана. Выберите нужную.':'Найдена отправка с перевозками этого плана.'}</p>
   <label>Фактическая отправка 1С<select aria-label="Фактическая отправка 1С" value={selected} disabled={disabled} onChange={event=>setSelected(event.target.value)}>
    <option value="">Выберите отправку</option>{candidates.map(item=><option key={item.key} value={item.key}>{item.number} · {dateLabel(item.date)} · совпало {item.matched}{item.vehicle?` · ${item.vehicle}`:''}{item.fresh?'':' · ждём обновления 1С'}</option>)}
   </select></label>
   {candidate&&!candidate.fresh&&<p>Данные ещё не обновлены после даты планирования или устарели. Сверка станет доступна после обновления 1С.</p>}
   {dirty&&<p>Сохраните изменения плана перед сверкой.</p>}
   <button type="button" className="button-primary" disabled={disabled||dirty||!candidate?.fresh} onClick={()=>onReconcile(selected)}>Сверить и освободить неотправленные</button>
  </>:<p>Ждём фактическую отправку 1С. До подтверждения отправки перевозки остаются закреплены в этом плане.</p>}
 </section>;
}
