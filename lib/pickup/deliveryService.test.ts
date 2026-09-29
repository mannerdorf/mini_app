import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../post1cZayavkaUpload.js',()=>({get1cOrderUploadCredentials:()=>({login:'fixture',password:'secret-fixture-password'}),POST_ZAYAVKA_URL:'https://example.test/PostZayavka2/'}));
vi.mock('../requestCancellation.js',()=>({requestFetch:vi.fn()}));
import { requestFetch } from '../requestCancellation.js';
import { deliverySetter } from './deliveryService.js';
afterEach(()=>vi.resetAllMocks());
it('captures non-JSON 401 response and redacts credentials from diagnostics',async()=>{
 vi.mocked(requestFetch).mockResolvedValue(new Response('Unauthorized secret-fixture-password',{status:401}));
 const result=await deliverySetter('SetPickupCost',{Номер:'001',СтоимостьПикапа:2448},true);
 expect(result).toMatchObject({ok:false,uncertain:false,diagnostics:{status:401,response:'Unauthorized [REDACTED]'}});
 expect(result.diagnostics?.curl).toContain('${ONE_C_PASSWORD}');
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
