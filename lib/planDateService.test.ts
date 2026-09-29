import {afterEach,it,expect,vi} from 'vitest';
import {callSetPlanDate} from './planDateService';
afterEach(()=>vi.unstubAllGlobals());
it('requires explicit positive acknowledgement',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:true}),{status:200})));
 expect(await callSetPlanDate('test','test','000142716','2026-09-30')).toEqual({ok:true});
});
it('does not treat an empty response as success',async()=>{
 const fetcher=vi.fn(async()=>new Response('{}',{status:200}));vi.stubGlobal('fetch',fetcher);
 expect(await callSetPlanDate('test','test','000142716','2026-09-30')).toMatchObject({ok:false,uncertain:true});
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps an explicit rejection separate from an ambiguous timeout',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Обработано 0'}),{status:200})));
 expect(await callSetPlanDate('test','test','000142716','2026-09-30')).toEqual({ok:false,error:'Обработано 0'});
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('timeout');}));
 expect(await callSetPlanDate('test','test','000142716','2026-09-30')).toMatchObject({ok:false,uncertain:true});
});
