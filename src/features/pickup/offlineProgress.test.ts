import { expect, it, vi } from 'vitest';
import type { Job } from '../../../lib/pickup/model';
import { localArrivalView, prepareDependentCommand, queuedArrival } from './offlineProgress';
import { sendOutbox, type Pending } from './outbox';
const job = { id:'a', status:'pending', version:3 } as Job;
const arrival: Pending = {id:'request-arrive',title:'Прибыл',body:{id:'a',action:'arrive',version:3,requestId:'request-arrive'}};
const complete = {id:'a',action:'complete',version:3,requestId:'request-complete',actual_places:2,photos:['data:image/jpeg;base64,saved']};
it('projects arrival without pretending that the server version changed',()=>{
 expect(localArrivalView(job,[arrival])).toEqual({...job,status:'arrived'});
 expect(job.status).toBe('pending');
 expect(prepareDependentCommand(complete,job,[arrival])).toEqual({...complete,version:4});
});
it('supports an accepted arrival whose response was lost',()=>{
 const updated={...job,status:'arrived',version:4} as Job;
 expect(queuedArrival(updated,[arrival])).toBe(arrival);
 expect(prepareDependentCommand({...complete,version:4},updated,[arrival])?.version).toBe(4);
});
it.each([
 {...arrival,error:'Conflict',status:409},
 {...arrival,body:{...arrival.body,action:'complete'}},
 {...arrival,body:{...arrival.body,version:1}},
])('refuses unsafe dependencies', pending=>{
 expect(queuedArrival(job,[pending])).toBeUndefined();
 expect(()=>prepareDependentCommand(complete,job,[pending])).toThrow('Сначала синхронизируйте');
});
it('does not queue a third command or rebase a changed point',()=>{
 const completion={id:'request-complete',title:'Забрал',body:{...complete,version:4}};
 expect(()=>prepareDependentCommand(complete,job,[arrival,completion])).toThrow();
 expect(()=>prepareDependentCommand({...complete,version:7},{...job,version:7},[arrival])).toThrow();
});
it('preserves dependency versions, photos and IDs across storage restoration and sends in order',async()=>{
 const pending:Pending[]=[arrival,{id:'request-complete',title:'Забрал',body:prepareDependentCommand(complete,job,[arrival])!}];
 const restored=JSON.parse(JSON.stringify(pending));
 let version=3;
 const call=vi.fn(async body=>{expect(body.version).toBe(version++);return {ok:true};});
 const save=vi.fn().mockResolvedValue(undefined);
 expect(await sendOutbox(restored,call,save)).toEqual([]);
 expect(call.mock.calls[1][0]).toEqual({...complete,version:4});
});
it('preserves dependent photos when arrival conflicts while sending another stop',async()=>{
 const pending=[arrival,{id:'request-complete',title:'Забрал',body:prepareDependentCommand(complete,job,[arrival])!},{id:'b',title:'B',body:{id:'b'}}];
 const call=vi.fn().mockRejectedValueOnce(Object.assign(new Error('Conflict'),{status:409})).mockResolvedValue({});
 const remaining=await sendOutbox(pending,call,vi.fn().mockResolvedValue(undefined));
 expect(call).toHaveBeenCalledTimes(2);
 expect(remaining[1].body.photos).toEqual(complete.photos);
 expect(remaining.map(p=>p.id)).toEqual(['request-arrive','request-complete']);
});
