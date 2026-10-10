import React,{useEffect,useState} from 'react';

/** Saved display preference; forecasts never create or change confirmed plans. */
export function PlanningForecastToggle({account}:{account:string}) {
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
 return <>
  <button type="button" role="switch" aria-checked={enabled} aria-label="Прогнозирование" aria-controls="planning-forecast-settings" className="sending-planning__forecast-toggle" onClick={toggle}>
   <span className="sending-planning__forecast-track" aria-hidden="true"><span/></span>
   <span>Прогнозирование</span><strong aria-hidden="true">{enabled?'Вкл':'Выкл'}</strong>
  </button>
  {enabled&&<section id="planning-forecast-settings" className="sending-planning__forecast-settings" aria-label="Параметры прогнозирования">
   <p><strong>Параметры прогноза:</strong> вручение в срок SLA · загрузка от 80% · заказ для парома за 2 дня до выхода судна.</p>
   <p className="sending-planning__muted" role="status">Даты заказа ТС пока не рассчитаны.</p>
  </section>}
 </>;
}
