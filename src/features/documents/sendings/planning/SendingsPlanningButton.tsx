import React,{lazy,Suspense,useState} from 'react';
import type {DocumentsAuth} from '../../../../api/client/documentsAuth';
const PlanningDialog=lazy(()=>import('./SendingsPlanningDialog').then(module=>({default:module.SendingsPlanningDialog})));
export function SendingsPlanningButton({auth}:{auth:DocumentsAuth}) {
 const [open,setOpen]=useState(false);
 return <><button type="button" className="filter-button sendings-planning-trigger" onClick={()=>setOpen(true)}>Планирование</button>{open&&<Suspense fallback={<span role="status">Открываем планирование…</span>}><PlanningDialog auth={auth} onClose={()=>setOpen(false)}/></Suspense>}</>;
}
