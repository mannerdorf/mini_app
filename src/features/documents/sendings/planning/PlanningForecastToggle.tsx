import React,{useEffect,useState} from 'react';
import {TrendingUp} from 'lucide-react';

/** Saved display preference; forecasts never create or change confirmed plans. */
export function usePlanningForecast(account:string) {
 const key=`haulz:planning:forecast:${account.trim().toLowerCase()}`;
 const [enabled,setEnabled]=useState(()=>{
  try{return localStorage.getItem(key)==='on';}catch{return false;}
 });
 useEffect(()=>{
  try{setEnabled(localStorage.getItem(key)==='on');}catch{setEnabled(false);}
 },[key]);
 const toggle=()=>setEnabled(previous=>{
  const next=!previous;
  try{localStorage.setItem(key,next?'on':'off');}catch{/* The switch still works without saved preferences. */}
  return next;
 });
 return {enabled,toggle};
}

export function PlanningForecastToggle({enabled,onToggle}:{enabled:boolean;onToggle:()=>void}) {
 return <>
  <button type="button" role="switch" aria-checked={enabled} aria-label="Прогнозирование" aria-controls={enabled?"planning-forecast-settings":undefined} className="sending-planning__forecast-toggle" onClick={onToggle}>
   <span className="sending-planning__forecast-track" aria-hidden="true"><span/></span>
   <TrendingUp size={16} aria-hidden="true"/><span>Прогнозирование</span><strong aria-hidden="true">{enabled?'Вкл':'Выкл'}</strong>
  </button>
  {enabled&&<section id="planning-forecast-settings" className="sending-planning__forecast-settings" aria-label="Параметры прогнозирования">
   <p><strong>Параметры прогноза:</strong> вручение в срок SLA · загрузка от 80% · заказ для парома за 2 дня до выхода судна.</p>
   <p className="sending-planning__muted" role="status">Подсветка ТС: зелёный — от 80%, жёлтый — ниже 80%, красный — перегруз или риск, серый — недостаточно данных. Пунктир — груз без плана на дату SLA вручения; просроченный груз показан сегодня. Даты выезда и заказа по истории поступлений и времени в пути пока не рассчитаны.</p>
  </section>}
 </>;
}
