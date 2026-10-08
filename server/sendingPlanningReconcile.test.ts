import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({pool:{},reconcile:vi.fn()}));
vi.mock('../api/_db.js',()=>({getPool:()=>state.pool}));
vi.mock('../lib/sendingPlanningReconciliation.js',()=>({reconcileSendingPlans:state.reconcile}));
import {startSendingPlanningReconciliation} from './sendingPlanningReconcile';
let stop:()=>void;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();state.reconcile.mockResolvedValue({checked:0,reconciled:0,released:0});});
afterEach(()=>{stop?.();vi.useRealTimers();vi.restoreAllMocks();});
it('checks the DB after startup and every five minutes without an open dialog',async()=>{
 stop=startSendingPlanningReconciliation();expect(state.reconcile).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(10000);expect(state.reconcile).toHaveBeenCalledWith(state.pool);
 await vi.advanceTimersByTimeAsync(290000);expect(state.reconcile).toHaveBeenCalledTimes(2);
 stop();await vi.advanceTimersByTimeAsync(300000);expect(state.reconcile).toHaveBeenCalledTimes(2);
});
it('avoids overlapping runs and continues after an error without logging confidential messages',async()=>{
 let resolve:(value:any)=>void=()=>{};state.reconcile.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});stop=startSendingPlanningReconciliation();
 await vi.advanceTimersByTimeAsync(600000);expect(state.reconcile).toHaveBeenCalledTimes(1);
 resolve({reconciled:0});await Promise.resolve();
 state.reconcile.mockRejectedValueOnce(Object.assign(new Error('secret connection data'),{code:'fixture-failure'}));
 await vi.advanceTimersByTimeAsync(300000);expect(state.reconcile).toHaveBeenCalledTimes(2);
 expect(log.mock.calls.flat().join(' ')).toContain('fixture-failure');expect(log.mock.calls.flat().join(' ')).not.toContain('secret');
 await vi.advanceTimersByTimeAsync(300000);expect(state.reconcile).toHaveBeenCalledTimes(3);
});
