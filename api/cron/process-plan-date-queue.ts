import type { VercelRequest,VercelResponse } from '@vercel/node';
import {requireCronAuth} from '../_lib/cronAuth.js';
import {getPool} from '../_db.js';
import {processPlanDateQueue} from '../../lib/planDateQueue.js';
import {callSetPlanDate,planDateCredentials,readPlanDate} from '../../lib/planDateService.js';
import {dispatchPlannedDeliveryDatePush} from '../../lib/dispatchPlannedDeliveryDatePush.js';
export default async function handler(req:VercelRequest,res:VercelResponse) {
 if(!['GET','POST'].includes(req.method||''))return res.status(405).json({error:'Method not allowed'});
 const denied=requireCronAuth(req);if(denied)return res.status(denied.status).json({error:denied.error});
 try {
   const {login,password}=planDateCredentials(),pool=getPool();
   const result=await processPlanDateQueue(pool,{write:(number,date)=>callSetPlanDate(login,password,number,date),read:number=>readPlanDate(login,password,number)});
   if(result.done && result.number) {
     void dispatchPlannedDeliveryDatePush({pool,date:result.date,cargoNumbers:[result.number]}).catch(()=>{});
   }
   return res.status(200).json({ok:true,...result});
 } catch {return res.status(503).json({error:'Очередь дат недоступна. Проверьте миграцию 120, настройки 1С и журнал сервера.'});}
}
