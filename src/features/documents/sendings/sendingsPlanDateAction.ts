import {postSendingsPlanDate} from '../../../api/client/documents';
import type {DocumentsAuth} from '../../../api/client/documentsAuth';
import {formatPerevozkaNumberForApi} from '../../../lib/perevozkaNumber';
type Setters={setLoading:(value:boolean)=>void;setError:(value:string|null)=>void;setInfo:(value:string|null)=>void;onClose?:()=>void;auth?:DocumentsAuth};
export async function applySendingsPlanDateForCargo(date:string,numbers:string[],setters:Setters) {
 if(!date){setters.setError('Укажите плановую дату прибытия на терминал.');return;}
 if(!numbers.length){setters.setError('Не найдены номера перевозок.');return;}
 if(!setters.auth?.login){setters.setError('Войдите в приложение.');return;}
 setters.setLoading(true);setters.setError(null);setters.setInfo(null);
 try {
   const result=await postSendingsPlanDate(date,[...new Set(numbers.map(formatPerevozkaNumberForApi).filter(Boolean))],setters.auth);
   if(!Array.isArray(result.tasks))throw new Error('Обновите API для работы с очередью плановых дат.');
   setters.setInfo(`В очереди обработки: ${result.queued}. Результат отображается в «Очереди плановых дат».`);
   if(typeof window!=='undefined')window.dispatchEvent(new Event('haulz:plan-date-queued'));
   setters.onClose?.();
 }catch(e){setters.setError((e as Error).message);}finally{setters.setLoading(false);}
}
