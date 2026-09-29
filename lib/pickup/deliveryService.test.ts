import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../post1cZayavkaUpload.js',()=>({get1cOrderUploadCredentials:()=>({login:'fixture',password:'secret-fixture-password'}),POST_ZAYAVKA_URL:'https://example.test/PostZayavka2/'}));
vi.mock('../oneCServiceAuth.js',()=>({SERVICE_AUTH:'Basic fixture-service-token'}));
vi.mock('../requestCancellation.js',()=>({requestFetch:vi.fn()}));
import { requestFetch } from '../requestCancellation.js';
import { deliverySetter } from './deliveryService.js';
beforeEach(()=>{vi.stubEnv('PEREVOZKI_SERVICE_LOGIN','perevozki-fixture');vi.stubEnv('PEREVOZKI_SERVICE_PASSWORD','secret-fixture-password');});
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
it('captures non-JSON 401 response and redacts credentials from diagnostics',async()=>{
 vi.mocked(requestFetch).mockResolvedValue(new Response('Unauthorized secret-fixture-password',{status:401}));
 const result=await deliverySetter('SetPickupCost',{Номер:'001',СтоимостьПикапа:2448},true);
 expect(result).toMatchObject({ok:false,uncertain:false,diagnostics:{status:401,response:'Unauthorized [REDACTED]'}});
 expect(result.diagnostics?.curl).toContain('${PEREVOZKI_SERVICE_PASSWORD}');
 expect(result.diagnostics?.curl).toContain('2448');
 expect(JSON.stringify(result)).not.toContain('secret-fixture-password');
});
it('keeps ordinary writes compact and preserves success handling',async()=>{
 vi.mocked(requestFetch).mockResolvedValue(new Response('{"Success":true}'));
 expect(await deliverySetter('SetPickupCost',{})).toEqual({ok:true});
});
it('reports an unknown result without retrying when the connection fails',async()=>{
 vi.mocked(requestFetch).mockRejectedValue(new Error('connection reset'));
 expect(await deliverySetter('SetPickupCost',{},true)).toMatchObject({ok:false,uncertain:true,diagnostics:{status:null,response:''}});
 expect(requestFetch).toHaveBeenCalledTimes(1);
});

it.each(['SetPickupCost','SetPickupNumber'] as const)('uses transportation credentials and both headers for %s',async(method)=>{
 vi.mocked(requestFetch).mockResolvedValue(new Response('{"Success":true}'));
 await deliverySetter(method,{});
 expect(requestFetch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({headers:expect.objectContaining({Auth:'Basic perevozki-fixture:secret-fixture-password',Authorization:'Basic fixture-service-token'})}));
});
it.each(['SetPickupCost','SetPickupNumber'] as const)('does not fall back to upload credentials for %s',async(method)=>{
 vi.stubEnv('PEREVOZKI_SERVICE_PASSWORD','');
 expect(await deliverySetter(method,{})).toMatchObject({ok:false,error:expect.stringContaining('PEREVOZKI_SERVICE_PASSWORD')});
 expect(requestFetch).not.toHaveBeenCalled();
});

it('includes service authorization in curl while hiding it from the response',async()=>{
 vi.mocked(requestFetch).mockResolvedValue(new Response('Basic fixture-service-token',{status:401}));
 const result=await deliverySetter('SetPickupCost',{},true);
 expect(result.diagnostics?.curl).toContain('--header "Authorization: ${SERVICE_AUTH}"');
 expect(result.diagnostics?.response).toBe('[REDACTED]');
 expect(JSON.stringify(result)).not.toContain('fixture-service-token');
});
