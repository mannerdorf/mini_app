import {useEffect,useState} from 'react';
import {fetchPlanDateQueue,type PlanDateQueueTask} from '../../../api/client/documentsSendings';
import type {DocumentsAuth} from '../../../api/client/documentsAuth';
const labels:Record<string,string>={pending:'В очереди',sending:'Отправляется',verifying:'Проверяем результат в 1С',done:'Записано',uncertain:'Требует сверки',error:'Ошибка'};
export function PlanDateQueueStatus({auth}:{auth:DocumentsAuth}) {
 const [tasks,setTasks]=useState<PlanDateQueueTask[]>([]),[error,setError]=useState('');
 useEffect(()=>{
  let stopped=false,running=false;
  const update=async()=>{
   if(running || document.hidden)return;running=true;
   try{const rows=await fetchPlanDateQueue(auth);if(!stopped){setTasks(rows);setError('');}}
   catch(e){if(!stopped)setError((e as Error).message);}
   finally{running=false;}
  };
  void update();const timer=setInterval(()=>void update(),10000);
  window.addEventListener('haulz:plan-date-queued',update);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('haulz:plan-date-queued',update);};
 },[auth.login,auth.password]);
 if(!tasks.length && !error)return null;
 return <details className="cargo-card" style={{padding:'12px',margin:'12px 0'}} open>
  <summary>Очередь плановых дат · {tasks.filter(task=>['pending','sending','verifying'].includes(task.state)).length} в обработке</summary>
  {error&&<p role="alert">{error}</p>}
  <div style={{maxHeight:240,overflow:'auto'}} aria-live="polite">
   {tasks.map(task=><p key={task.cargo_number}>Перевозка {task.cargo_number} · {task.target_date} · <strong>{labels[task.state]||task.state}</strong>{task.last_error?` — ${task.last_error}`:''}</p>)}
  </div>
 </details>;
}
