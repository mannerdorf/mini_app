import {getPool} from '../api/_db.js';
import {reconcileSendingPlans} from '../lib/sendingPlanningReconciliation.js';

/** Checks the synchronized DB even when the planning dialog is closed. No 1C calls. */
export function startSendingPlanningReconciliation() {
 let running=false;
 const check=async()=>{
  if(running)return;
  running=true;
  try{
   const result=await reconcileSendingPlans(getPool());
   if(result.reconciled)console.log(JSON.stringify({level:'info',event:'sending_plans_reconciled',...result}));
  }catch(error){
   console.error(JSON.stringify({level:'error',event:'sending_plans_reconcile_failed',code:(error as {code?:string}).code||'unknown'}));
  }finally{running=false;}
 };
 const first=setTimeout(()=>void check(),10000),timer=setInterval(()=>void check(),5*60000);
 first.unref();timer.unref();
 return()=>{clearTimeout(first);clearInterval(timer);};
}
