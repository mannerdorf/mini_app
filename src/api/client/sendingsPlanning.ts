import {apiFetchJson} from '../../utils';
import type {DocumentsAuth} from './documentsAuth';
import type {PlanDraft,PlanningData} from '../../features/documents/sendings/planning/planningModel';
const request=<T>(auth:DocumentsAuth,body:Record<string,unknown>,signal?:AbortSignal)=>apiFetchJson<T>('/api/sendings-planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...auth,...body}),signal});
export const fetchSendingPlanning=(auth:DocumentsAuth,from:string,to:string,signal?:AbortSignal)=>request<PlanningData>(auth,{action:'list',from,to},signal);
export const saveSendingPlanning=(auth:DocumentsAuth,plan:PlanDraft)=>request<{id:string}>(auth,{action:'save',plan});
export const deleteSendingPlanning=(auth:DocumentsAuth,id:string,revision:number)=>request<{ok:boolean}>(auth,{action:'delete',id,revision});
