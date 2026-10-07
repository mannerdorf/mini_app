import {afterEach,expect,it,vi} from 'vitest';
import {clientTariffs1cHeaders,fetchClientTariffsFrom1c} from './clientTariffs1c';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses configured HAULZ authorization and the shared publication authorization',async()=>{
 vi.stubEnv('POSTB_HAULZ_AUTH','Basic haulz-fixture:secret-fixture');
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({Success:true,Тарифы:[]}),{status:200}));vi.stubGlobal('fetch',fetch);
 const result=await fetchClientTariffsFrom1c('https://fixture.invalid/GetClientTariffs/');
 expect(result.Тарифы).toEqual([]);
 expect(fetch.mock.calls[0][1].headers.Auth).toBe('Basic haulz-fixture:secret-fixture');
 expect(fetch.mock.calls[0][1].headers.Authorization).toMatch(/^Basic /);
 expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('login');
});
it('falls back to the existing HAULZ tariff account when no override is configured',()=>{
 vi.stubEnv('POSTB_HAULZ_AUTH','');
 expect(clientTariffs1cHeaders().Auth.startsWith('Basic Info@haulz.pro:')).toBe(true);
});
it('reports the upstream status without exposing the response body',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private details',{status:404})));
 const onResponse=vi.fn(async()=>{});
 await expect(fetchClientTariffsFrom1c('https://fixture.invalid',onResponse)).rejects.toThrow('1C HTTP 404');
 expect(onResponse).toHaveBeenCalledWith(404);
});
