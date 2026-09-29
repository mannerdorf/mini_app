import {it,expect,vi} from 'vitest';
vi.mock('../../../api/client/documents',()=>({postSendingsPlanDate:vi.fn()}));
import {postSendingsPlanDate} from '../../../api/client/documents';
import {applySendingsPlanDateForCargo} from './sendingsPlanDateAction';
import {collectSendingFreightCargoNumbers} from './sendingsMetrics';
const auth={login:'staff',password:'test'};
it('queues linked cargo numbers in one request without claiming they are written',async()=>{
 const numbers=collectSendingFreightCargoNumbers({Номер:'2704213',Посылки:[{Перевозка:'142716'},{Перевозка:'142716'}]});
 vi.mocked(postSendingsPlanDate).mockResolvedValue({queued:1,tasks:[]});
 const info=vi.fn(),close=vi.fn();
 await applySendingsPlanDateForCargo('2026-09-30',numbers,{auth,setLoading:vi.fn(),setError:vi.fn(),setInfo:info,onClose:close});
 expect(postSendingsPlanDate).toHaveBeenLastCalledWith('2026-09-30',['000142716'],auth);
 expect(info).toHaveBeenLastCalledWith(expect.stringContaining('В очереди обработки: 1'));
 expect(close).toHaveBeenCalledOnce();
});
it('retains the dialog when enqueueing fails',async()=>{
 vi.mocked(postSendingsPlanDate).mockRejectedValue(new Error('Очередь недоступна'));
 const error=vi.fn(),close=vi.fn();
 await applySendingsPlanDateForCargo('2026-09-30',['142716'],{auth,setLoading:vi.fn(),setError:error,setInfo:vi.fn(),onClose:close});
 expect(close).not.toHaveBeenCalled();expect(error).toHaveBeenLastCalledWith('Очередь недоступна');
});
