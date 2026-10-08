import React,{createContext,useContext,useEffect,useState,useMemo,useCallback,type ReactNode} from 'react';
import {Play,RotateCcw} from 'lucide-react';
import './plan-date-queue.css';
import {uniquePlanDateTasks} from './planDateQueueTasks';
import {fetchPlanDateQueue,resumePlanDateQueue,restartPlanDateQueue,type PlanDateQueueTask} from '../../../api/client/documentsSendings';
import type {DocumentsAuth} from '../../../api/client/documentsAuth';
import {collectSendingFreightCargoNumbers} from './sendingsMetrics';
import {formatPerevozkaNumberForApi} from '../../../lib/perevozkaNumber';

const QueueContext=createContext<{byNumber:Map<string,PlanDateQueueTask>;error:string;resume?:(task:PlanDateQueueTask)=>Promise<void>;restart?:(tasks:PlanDateQueueTask[])=>Promise<void>}>({byNumber:new Map(),error:''});
const labels:Record<string,string>={pending:'В очереди',sending:'Отправляется',verifying:'Проверяем результат в 1С',done:'Записано',uncertain:'Требует сверки',error:'Ошибка'};
function rowNumbers(row:unknown):string[]{
 return [...new Set(collectSendingFreightCargoNumbers(row).map(formatPerevozkaNumberForApi).filter(Boolean))];
}
export function PlanDateQueueProvider({auth,rows,children}:{auth?:DocumentsAuth|null;rows:unknown[];children:ReactNode}) {
 const [state,setState]=useState({tasks:[] as PlanDateQueueTask[],error:''});
 const numbersKey=useMemo(()=>JSON.stringify([...new Set(rows.flatMap(rowNumbers))].sort()),[rows]);
 useEffect(()=>{
  setState({tasks:[],error:''});
  if(!auth)return;
  let stopped=false,running=false,nextPollAt=0;
  const numbers=JSON.parse(numbersKey) as string[];
  const update=async(force=false)=>{
   if(!force && Date.now()<nextPollAt)return;
   if(running || document.hidden)return;running=true;
   try{
    const tasks:PlanDateQueueTask[]=[];
    for(let offset=0;offset<numbers.length;offset+=500){
     if(stopped)return;
     tasks.push(...await fetchPlanDateQueue(auth,numbers.slice(offset,offset+500)));
    }
    const unique=uniquePlanDateTasks(tasks);
    nextPollAt=Date.now()+(unique.some(task=>['pending','sending','verifying'].includes(task.state))?30000:60000);
    if(!stopped)setState(prev=>!prev.error&&JSON.stringify(prev.tasks)===JSON.stringify(unique)?prev:{tasks:unique,error:''});
   }catch(e){nextPollAt=Date.now()+60000;if(!stopped)setState(prev=>({...prev,error:(e as Error).message}));}
   finally{running=false;}
  };
  void update();const timer=setInterval(()=>void update(),10000);
  const queued=()=>void update(true);
  window.addEventListener('haulz:plan-date-queued',queued);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('haulz:plan-date-queued',queued);};
 },[auth?.login,auth?.password,numbersKey]);
 const resume=useCallback(async(task:PlanDateQueueTask)=>{
  if(!auth)return;
  const updated=await resumePlanDateQueue(auth,task);
  setState(prev=>({...prev,tasks:prev.tasks.map(item=>item.cargo_number===updated.cargo_number?updated:item)}));
  window.dispatchEvent(new Event('haulz:plan-date-queued'));
 },[auth?.login,auth?.password]);
 const restart=useCallback(async(tasks:PlanDateQueueTask[])=>{
  if(!auth)return;
  const updated=await restartPlanDateQueue(auth,tasks);
  const byCargo=new Map(updated.map(task=>[task.cargo_number,task]));
  setState(prev=>({...prev,tasks:prev.tasks.map(item=>byCargo.get(item.cargo_number)||item)}));
  window.dispatchEvent(new Event('haulz:plan-date-queued'));
 },[auth?.login,auth?.password]);
 const byNumber=useMemo(()=>new Map(state.tasks.map(task=>[formatPerevozkaNumberForApi(task.cargo_number),task])),[state.tasks]);
 const context=useMemo(()=>({byNumber,error:state.error,resume:auth?resume:undefined,restart:auth?restart:undefined}),[byNumber,state.error,resume,restart,!!auth]);
 return <QueueContext.Provider value={context}>{children}</QueueContext.Provider>;
}

export function SendingPlanDateProgress({row,fallback}:{row:unknown;fallback:ReactNode}) {
 const {byNumber,error,resume,restart}=useContext(QueueContext);
 const [resuming,setResuming]=useState<string|null>(null);
 const [restarting,setRestarting]=useState(false);
 const [resumeError,setResumeError]=useState('');
 const [expanded,setExpanded]=useState(false);
 const numbers=useMemo(()=>rowNumbers(row),[row]);
 const matching=useMemo(()=>numbers.map(number=>byNumber.get(number)).filter((task):task is PlanDateQueueTask=>!!task),[numbers,byNumber]);
 if(!matching.length)return <>{fallback}{error&&<span className="sending-plan-progress__error" title={error}> · Очередь недоступна</span>}</>;
 const done=matching.filter(task=>task.state==='done').length;
 const attention=matching.filter(task=>['error','uncertain'].includes(task.state)).length;
 const waiting=matching.filter(task=>task.state==='pending').length;
 const sending=matching.filter(task=>task.state==='sending').length;
 const verifying=matching.filter(task=>task.state==='verifying').length;
 const busy=!error && sending>0;
 const queueStatus=[sending?`Отправка: ${sending}`:'',waiting?`В очереди: ${waiting}`:'',verifying?`Ожидают подтверждения: ${verifying}`:''].filter(Boolean).join(' · ');
 const description=`Записано ${done} из ${matching.length}${attention?`; требуют внимания: ${attention}`:''}${error?`; ${error}`:''}`;
 const restartable=matching.filter(task=>['pending','error','verifying','uncertain'].includes(task.state));
 return <span className="sending-plan-progress" onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
  <span className="sending-plan-progress__row">
  <details onToggle={event=>setExpanded(event.currentTarget.open)}>
   <summary aria-label={`Установка плановых дат: ${description}. Подробности`} title={description}>
    <span className={`sending-plan-progress__bar${busy?' sending-plan-progress__bar--busy':''}${attention||error?' sending-plan-progress__bar--attention':''}`}
     role="progressbar" aria-label="Установка плановых дат" aria-valuemin={0} aria-valuemax={matching.length} aria-valuenow={done} aria-valuetext={description}>
     <span className="sending-plan-progress__fill" style={{width:`${done/matching.length*100}%`}} />
     <span className="sending-plan-progress__count">{done}/{matching.length}</span>
    </span>
   </summary>
   <span className="sending-plan-progress__details">
    {error&&<span role="alert">{error}<br/></span>}
    {expanded&&matching.map(task=>{
     const date=task.target_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');
     const statusLabel=labels[task.state]||task.state;
     return <span key={task.cargo_number}
      className={`sending-plan-progress__entry sending-plan-progress__entry--${task.state==='done'?'done':'pending'}`}
      title={`${statusLabel}${task.last_error?` — ${task.last_error}`:''}`}
      aria-label={`${task.cargo_number}, ${date}, ${statusLabel}${task.last_error?`, ${task.last_error}`:''}`}>
      {task.cargo_number} · {date}
      {resume&&['error','uncertain'].includes(task.state)&&<button type="button" className="sending-plan-progress__resume"
       disabled={resuming!==null||restarting} aria-label={`Продолжить отправку ${task.cargo_number}`} title="Продолжить: повторно поставить эту дату в очередь 1С"
       onClick={async()=>{if(resuming)return;setResuming(task.cargo_number);setResumeError('');try{await resume(task);}catch(e){setResumeError((e as Error).message);}finally{setResuming(null);}}}><Play size={14} aria-hidden="true"/> Продолжить</button>}
     </span>;
    })}
   </span>
  </details>
  {restart&&done<matching.length&&<button type="button" className="sending-plan-progress__restart"
   disabled={restarting||resuming!==null||!restartable.length||!!error} aria-label="Перезапустить всю очередь" title="Перезапустить всю очередь" aria-busy={restarting}
   onClick={async()=>{if(restarting||resuming!==null)return;setRestarting(true);setResumeError('');try{await restart(restartable);}catch(e){setResumeError((e as Error).message);}finally{setRestarting(false);}}}>
   <RotateCcw size={16} aria-hidden="true"/>
  </button>}
  </span>
  {queueStatus&&!error&&<span className="sending-plan-progress__status">{queueStatus}</span>}
  {resumeError&&<span className="sending-plan-progress__error" role="alert">{resumeError}</span>}
  {(attention>0 || error)&&<span className="sending-plan-progress__error">{error?'Нет обновления':`Требуют внимания: ${attention}`}</span>}
 </span>;
}
