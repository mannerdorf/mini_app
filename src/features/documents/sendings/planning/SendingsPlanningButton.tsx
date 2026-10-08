import React,{lazy,Suspense,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import type {DocumentsAuth} from '../../../../api/client/documentsAuth';
const PlanningDialog=lazy(()=>import('./SendingsPlanningDialog').then(module=>({default:module.SendingsPlanningDialog})));
export function SendingsPlanningButton({auth}:{auth:DocumentsAuth}) {
 const [open,setOpen]=useState(false);
 return <><button type="button" className="sendings-action-icon sendings-action-icon--planning sendings-planning-trigger" aria-label="Планирование" title="Планирование отправок" onClick={()=>setOpen(true)}><CalendarDays size={22} aria-hidden="true"/></button>{open&&<Suspense fallback={<span role="status">Открываем планирование…</span>}><PlanningDialog auth={auth} onClose={()=>setOpen(false)}/></Suspense>}</>;
}
