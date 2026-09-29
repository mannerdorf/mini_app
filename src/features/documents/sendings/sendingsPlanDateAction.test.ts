import {it,expect,vi} from 'vitest';
vi.mock('../../../api/client/documents',()=>({postSendingsPlanDate:vi.fn()}));
import {postSendingsPlanDate} from '../../../api/client/documents';
import {applySendingsPlanDateForCargo} from './sendingsPlanDateAction';
import {collectSendingFreightCargoNumbers} from './sendingsMetrics';
it('uses linked freight numbers, not the sending or parcel identifier',async()=>{
 const numbers=collectSendingFreightCargoNumbers({Номер:'2704213',Посылки:[{ИДОтправления:'999',Перевозка:'142716'},{Перевозка:'142716'}]});
 expect(numbers).toEqual(['142716']);
 vi.mocked(postSendingsPlanDate).mockResolvedValue({updated:1,requested:1,failed:0} as any);
 const close=vi.fn();
 await applySendingsPlanDateForCargo('2026-09-30',numbers,{setLoading:vi.fn(),setError:vi.fn(),setInfo:vi.fn(),onClose:close});
 expect(postSendingsPlanDate).toHaveBeenLastCalledWith('2026-09-30',['000142716']);
 expect(close).toHaveBeenCalledOnce();
 expect(collectSendingFreightCargoNumbers({Номер:'2704213',ИДОтправления:'999'})).toEqual([]);
});
it('keeps the date dialog open when 1C updates nothing',async()=>{
 vi.mocked(postSendingsPlanDate).mockResolvedValue({updated:0,requested:1,failed:1,errors:[{error:'Обработано 0'}]} as any);
 const close=vi.fn(),error=vi.fn();
 await applySendingsPlanDateForCargo('2026-09-30',['142716'],{setLoading:vi.fn(),setError:error,setInfo:vi.fn(),onClose:close});
 expect(close).not.toHaveBeenCalled();
 expect(error).toHaveBeenLastCalledWith(expect.stringContaining('не записана: 0 из 1'));
});
