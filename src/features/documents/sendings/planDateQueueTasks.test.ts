import {expect,it} from 'vitest';
import {uniquePlanDateTasks} from './planDateQueueTasks';
import type {PlanDateQueueTask} from '../../../api/client/documentsSendings';

it('keeps 9/11 when an older API returns the same queue in two batches',()=>{
 const tasks:PlanDateQueueTask[]=Array.from({length:11},(_,i)=>({cargo_number:String(142430+i),target_date:'2026-09-22',state:i<9?'done':'verifying'}));
 const result=uniquePlanDateTasks([...tasks,...tasks]);
 expect(result).toHaveLength(11);
 expect(result.filter(task=>task.state==='done')).toHaveLength(9);
});
it('normalizes numbers and retains the most recent state, regardless of response order',()=>{
 const older={cargo_number:'142430',target_date:'2026-09-22',state:'verifying',updated_at:'2026-09-29T12:20:00Z'};
 const newer={...older,cargo_number:'000142430',state:'done',updated_at:'2026-09-29T12:25:00Z'};
 expect(uniquePlanDateTasks([newer,older])).toEqual([newer]);
 expect(uniquePlanDateTasks([older,newer])).toEqual([newer]);
});
it('keeps distinct tasks from filtered batches',()=>{
 const first={cargo_number:'000142430',target_date:'2026-09-22',state:'done'};
 const second={...first,cargo_number:'000142432',state:'uncertain'};
 expect(uniquePlanDateTasks([first,second])).toEqual([first,second]);
});
