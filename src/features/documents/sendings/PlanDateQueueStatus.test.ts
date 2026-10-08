import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../../../api/client/documentsSendings',()=>({fetchPlanDateQueue:vi.fn(),resumePlanDateQueue:vi.fn(),restartPlanDateQueue:vi.fn()}));
import {fetchPlanDateQueue,restartPlanDateQueue} from '../../../api/client/documentsSendings';
import {PlanDateQueueProvider,SendingPlanDateProgress} from './PlanDateQueueStatus';
let root:ReturnType<typeof create>;
afterEach(()=>{act(()=>root?.unmount());vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();});
it('renders details only when opened and polls idle queues once per minute',async()=>{
 vi.useFakeTimers();vi.stubGlobal('document',{hidden:false});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.mocked(fetchPlanDateQueue).mockResolvedValue([{cargo_number:'000142716',target_date:'2026-09-30',state:'done'}]);
 const row={CargoNumber:'000142716'};
 await act(async()=>{root=create(React.createElement(PlanDateQueueProvider,{auth:{login:'staff',password:'fixture'},rows:[row],children:React.createElement(SendingPlanDateProgress,{row,fallback:'нет'})}));});
 expect(fetchPlanDateQueue).toHaveBeenCalledTimes(1);
 expect(root.root.findAllByProps({className:'sending-plan-progress__entry sending-plan-progress__entry--done'})).toHaveLength(0);
 await act(async()=>root.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
 expect(JSON.stringify(root.toJSON())).toContain('30.09.2026');
 await act(async()=>vi.advanceTimersByTime(30000));
 expect(fetchPlanDateQueue).toHaveBeenCalledTimes(1);
 await act(async()=>vi.advanceTimersByTime(30000));
 expect(fetchPlanDateQueue).toHaveBeenCalledTimes(2);
});

it('restarts all eligible tasks from the icon without opening the details',async()=>{
 vi.stubGlobal('document',{hidden:false});vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()});
 const tasks=['done','pending','error','uncertain','sending'].map((state,index)=>({cargo_number:String(142716+index).padStart(9,'0'),target_date:'2026-09-30',updated_at:'2026-10-08T10:00:00.000Z',state}));
 const row={Parcels:tasks.map(task=>({CargoNumber:task.cargo_number}))};
 vi.mocked(fetchPlanDateQueue).mockResolvedValue(tasks);
 vi.mocked(restartPlanDateQueue).mockResolvedValue(tasks.slice(1,4).map(task=>({...task,state:task.state==='uncertain'?'verifying':'pending'})));
 const auth={login:'staff',password:'fixture'};
 await act(async()=>{root=create(React.createElement(PlanDateQueueProvider,{auth,rows:[row],children:React.createElement(SendingPlanDateProgress,{row,fallback:'нет'})}));});
 const button=root.root.findByProps({'aria-label':'Перезапустить всю очередь'});
 expect(button.parent?.props.className).toBe('sending-plan-progress__row');
 await act(async()=>button.props.onClick());
 expect(restartPlanDateQueue).toHaveBeenCalledExactlyOnceWith(auth,tasks.slice(1,4));
 expect(root.root.findAllByProps({className:'sending-plan-progress__details'})[0].children).toHaveLength(0);
 expect(JSON.stringify(root.toJSON())).toContain('В очереди: 2');
 expect(JSON.stringify(root.toJSON())).toContain('Ожидают подтверждения: 1');
});
