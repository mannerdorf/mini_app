import {afterEach,expect,it,vi} from 'vitest';
import {sendLkAddTo1c} from './sendLkTo1c';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each([true,false])('checks 1C Success even with HTTP 200 (%s)',async(success)=>{
 vi.stubEnv('ONE_C_SUPERADMIN_LOGIN','test');vi.stubEnv('ONE_C_SUPERADMIN_PASSWORD','test');
 const fetch=vi.fn(async()=>new Response(JSON.stringify({Success:success,Error:success?undefined:'Отклонено'}),{status:200}));vi.stubGlobal('fetch',fetch);
 const result=await sendLkAddTo1c({inn:'7710431565',email:'test@example.ru'});
 expect(result.ok).toBe(success);expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
