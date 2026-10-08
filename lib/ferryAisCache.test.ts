import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),request:vi.fn()}));
vi.mock('../api/_db.js',()=>({getPool:()=>({query:mocks.query})}));
vi.mock('./marinesiaRequest.js',()=>({requestMarinesia:mocks.request}));
import {requestFerryLatest} from './ferryAisCache';
afterEach(()=>vi.clearAllMocks());
const url='https://api.marinesia.com/api/v1/vessel/273611990/location/latest?key=secret';
it('shares stored results without changing the AIS source timestamp',async()=>{
 const data={data:{ts:'2026-10-07T21:32:00',status:5}};
 mocks.query.mockResolvedValueOnce({rows:[{payload:data}]});
 expect(await (await requestFerryLatest(url)).json()).toEqual(data);
 expect(mocks.request).not.toHaveBeenCalled();
 expect(mocks.query.mock.calls[0][1]).toEqual(['273611990',300000]);
});
it('stores only successful source payloads and never keys',async()=>{
 mocks.query.mockResolvedValue({rows:[]});mocks.request.mockResolvedValue(Response.json({data:{status:5}}));
 await requestFerryLatest(url,undefined,7200000);
 expect(mocks.query.mock.calls[1][1]).toEqual(['273611990',JSON.stringify({data:{status:5}})]);
});
it('continues without DB cache and does not store upstream errors',async()=>{
 mocks.query.mockRejectedValue(new Error('migration not installed'));
 mocks.request.mockResolvedValue(Response.json({error:true},{status:429}));
 expect((await requestFerryLatest(url)).status).toBe(429);
 expect(mocks.query).toHaveBeenCalledOnce();
});
