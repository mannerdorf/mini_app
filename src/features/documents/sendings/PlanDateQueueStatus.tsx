import {useEffect,useState} from 'react';
import './plan-date-queue.css';
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
 const pending=tasks.filter(task=>['pending','sending','verifying'].includes(task.state)).length;
 const attention=tasks.filter(task=>['uncertain','error'].includes(task.state)).length;
 const status=error?'Не удалось обновить очередь':pending>0?`${pending} в обработке`:attention>0?'Обработка завершена с замечаниями':'Обработка завершена';
 const busy=pending>0 && !error;
 return <section className="plan-date-queue" aria-label="Очередь плановых дат">
  <div className="plan-date-queue__heading">
   <span>Очередь плановых дат</span>
   <div
   className={`plan-date-queue__track${busy?' plan-date-queue__track--busy':''}${attention || error?' plan-date-queue__track--attention':''}`}
   role={busy?'progressbar':undefined}
   aria-label={busy?'Обработка плановых дат':undefined}
   aria-valuetext={busy?`${pending} заданий в обработке`:undefined}
   ><div className="plan-date-queue__fill" /></div>
   <span role="status">{status}</span>
  </div>
  {attention>0&&<p className="plan-date-queue__notice" role="status">Требуют внимания: {attention}</p>}
  {error&&<p className="plan-date-queue__notice" role="alert">{error}</p>}
  <details className="plan-date-queue__details">
   <summary>Подробности</summary>
   <div className="plan-date-queue__tasks">
    {tasks.map(task=><p key={task.cargo_number}>Перевозка {task.cargo_number} · {task.target_date} · <strong>{labels[task.state]||task.state}</strong>{task.last_error?` — ${task.last_error}`:''}</p>)}
   </div>
  </details>
 </section>;
}
