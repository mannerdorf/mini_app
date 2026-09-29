import {afterEach,it,expect,vi} from 'vitest';
import {callSetPlanDate,planDateCredentials,PlanDateConfigurationError} from './planDateService';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
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

const prefixes=['PLAN_DATE_SERVICE','HAULZ_1C_SERVICE','PEREVOZKI_SERVICE','POLL_SERVICE'];
function clearCredentials(){for(const prefix of prefixes){vi.stubEnv(`${prefix}_LOGIN`,'');vi.stubEnv(`${prefix}_PASSWORD`,'');}}
it('supports the shared POLL service account',()=>{
 clearCredentials();vi.stubEnv('POLL_SERVICE_LOGIN','poll');vi.stubEnv('POLL_SERVICE_PASSWORD','poll-password');
 expect(planDateCredentials()).toEqual({login:'poll',password:'poll-password'});
});
it('prefers a complete dedicated account and never mixes credential pairs',()=>{
 clearCredentials();vi.stubEnv('PLAN_DATE_SERVICE_LOGIN','dedicated');vi.stubEnv('POLL_SERVICE_LOGIN','poll');vi.stubEnv('POLL_SERVICE_PASSWORD','poll-password');
 expect(planDateCredentials()).toEqual({login:'poll',password:'poll-password'});
 vi.stubEnv('PLAN_DATE_SERVICE_PASSWORD','dedicated-password');
 expect(planDateCredentials()).toEqual({login:'dedicated',password:'dedicated-password'});
});
it('rejects incomplete configuration before processing tasks',()=>{
 clearCredentials();vi.stubEnv('POLL_SERVICE_LOGIN','poll');
 expect(()=>planDateCredentials()).toThrow(PlanDateConfigurationError);
});
