import React,{lazy,Suspense,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import type {DocumentsAuth} from '../../../../api/client/documentsAuth';
const PlanningDialog=lazy(()=>import('./SendingsPlanningDialog').then(module=>({default:module.SendingsPlanningDialog})));
export function SendingsPlanningButton({auth}:{auth:DocumentsAuth}) {
 const [open,setOpen]=useState(false);
 return <><button type="button" className="filter-button" onClick={()=>setOpen(true)}><CalendarDays size={16} aria-hidden="true"/> Планирование</button>{open&&<Suspense fallback={<span role="status">Открываем планирование…</span>}><PlanningDialog auth={auth} onClose={()=>setOpen(false)}/></Suspense>}</>;
}
