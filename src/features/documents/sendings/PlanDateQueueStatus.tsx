import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import './plan-date-queue.css';
import {fetchPlanDateQueue,type PlanDateQueueTask} from '../../../api/client/documentsSendings';
import type {DocumentsAuth} from '../../../api/client/documentsAuth';
import {collectSendingFreightCargoNumbers} from './sendingsMetrics';
import {formatPerevozkaNumberForApi} from '../../../lib/perevozkaNumber';

const QueueContext=createContext<{tasks:PlanDateQueueTask[];error:string}>({tasks:[],error:''});
const labels:Record<string,string>={pending:'В очереди',sending:'Отправляется',verifying:'Проверяем результат в 1С',done:'Записано',uncertain:'Требует сверки',error:'Ошибка'};
function rowNumbers(row:unknown):string[]{
 return [...new Set(collectSendingFreightCargoNumbers(row).map(formatPerevozkaNumberForApi).filter(Boolean))];
}
export function PlanDateQueueProvider({auth,rows,children}:{auth?:DocumentsAuth|null;rows:unknown[];children:ReactNode}) {
 const [state,setState]=useState({tasks:[] as PlanDateQueueTask[],error:''});
 const numbersKey=JSON.stringify([...new Set(rows.flatMap(rowNumbers))].sort());
 useEffect(()=>{
  setState({tasks:[],error:''});
  if(!auth)return;
  let stopped=false,running=false;
  const numbers=JSON.parse(numbersKey) as string[];
  const update=async()=>{
   if(running || document.hidden)return;running=true;
   try{
    const tasks:PlanDateQueueTask[]=[];
    for(let offset=0;offset<numbers.length;offset+=500){
     if(stopped)return;
     tasks.push(...await fetchPlanDateQueue(auth,numbers.slice(offset,offset+500)));
    }
    if(!stopped)setState({tasks,error:''});
   }catch(e){if(!stopped)setState(prev=>({...prev,error:(e as Error).message}));}
   finally{running=false;}
  };
  void update();const timer=setInterval(()=>void update(),10000);
  window.addEventListener('haulz:plan-date-queued',update);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('haulz:plan-date-queued',update);};
 },[auth?.login,auth?.password,numbersKey]);
 return <QueueContext.Provider value={state}>{children}</QueueContext.Provider>;
}

export function SendingPlanDateProgress({row,fallback}:{row:unknown;fallback:ReactNode}) {
 const {tasks,error}=useContext(QueueContext);
 const numbers=new Set(rowNumbers(row));
 const matching=tasks.filter(task=>numbers.has(formatPerevozkaNumberForApi(task.cargo_number)));
 if(!matching.length)return <>{fallback}{error&&<span className="sending-plan-progress__error" title={error}> · Очередь недоступна</span>}</>;
 const done=matching.filter(task=>task.state==='done').length;
 const attention=matching.filter(task=>['error','uncertain'].includes(task.state)).length;
 const busy=!error && matching.some(task=>['pending','sending','verifying'].includes(task.state));
 const description=`Записано ${done} из ${matching.length}${attention?`; требуют внимания: ${attention}`:''}${error?`; ${error}`:''}`;
 return <span className="sending-plan-progress" onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
  <details>
   <summary aria-label={`Установка плановых дат: ${description}. Подробности`} title={description}>
    <span className={`sending-plan-progress__bar${busy?' sending-plan-progress__bar--busy':''}${attention||error?' sending-plan-progress__bar--attention':''}`}
     role="progressbar" aria-label="Установка плановых дат" aria-valuemin={0} aria-valuemax={matching.length} aria-valuenow={done} aria-valuetext={description}>
     <span className="sending-plan-progress__fill" style={{width:`${done/matching.length*100}%`}} />
     <span className="sending-plan-progress__count">{done}/{matching.length}</span>
    </span>
   </summary>
   <span className="sending-plan-progress__details">
    {error&&<span role="alert">{error}<br/></span>}
    {matching.map(task=><span key={task.cargo_number}>{task.cargo_number} · {task.target_date} · {labels[task.state]||task.state}{task.last_error?` — ${task.last_error}`:''}<br/></span>)}
   </span>
  </details>
  {(attention>0 || error)&&<span className="sending-plan-progress__error">{error?'Нет обновления':`Требуют внимания: ${attention}`}</span>}
 </span>;
}
